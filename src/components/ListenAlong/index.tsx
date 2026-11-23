'use client';

// Listen-along player for audio-backed lessons (#185) and zero-cost client TTS
// text/EPUB lessons (U6): timestamped transcript segments or markdown-stripped
// sentences rendered with the reader's word-state coloring (shared <WordCell>).
// Two sub-modes over one transport:
//
// - Continuous (default): flowing playback; the active sentence highlights as
//   playback progresses (scrub/seek in audio mode; sentence-by-sentence in TTS).
// - Shadow: the stepped drill of #39 — one sentence plays and auto-pauses so
//   the learner repeats it aloud (honour system), with Repeat / Prev / Next /
//   speed.
//
// Tapping any word auto-pauses and opens the translation drawer via the same
// onWordClick contract MarkdownReader uses, so vocab actions work identically.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  ArrowLeft,
  BookOpenText,
  FastForward,
  Pause,
  Play,
  Repeat2,
  Rewind,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import type { AudioTranscriptSegment, Lesson, WordState } from '@/types';
import {
  getLanguageConfig,
  isValidLanguageCode,
  lookupByVocabKeys,
  makeWordSegmentation,
} from '@/lib/languages';
import { languageDisplayName } from '@/lib/language-names';
import { getVoiceForLanguage, waitForVoices } from '@/lib/tts';
import { useActiveLanguage } from '@/utils/hooks';
import { trackProductEvent } from '@/lib/product-analytics';
import { parseSegmentWords, splitWords } from '@/components/MarkdownReader/utils';
import WordCell from '@/components/WordCell';
import {
  createBrowserTtsPlayer,
  type BrowserTtsErrorCode,
  type BrowserTtsPlayer,
} from './browser-tts-player';
import { createAudioUnitPlayer, type UnitPlayer } from './drill-player';
import { activeSegmentIndex, formatClock, nextPlaybackRate } from './utils';

const SKIP_SECONDS = 5;

interface ListenAlongBaseProps {
  lesson: Lesson;
  knownWordsMap: Map<string, WordState>;
  wordPanelOpen?: boolean;
  onWordClick: (word: string, sentence: string) => void;
  /** Back to reading mode. */
  onExit: () => void;
}

export interface AudioListenAlongProps extends ListenAlongBaseProps {
  mode?: 'audio';
  segments: AudioTranscriptSegment[];
  audioUrl: string;
  sentences?: never;
}

export interface TtsListenAlongProps extends ListenAlongBaseProps {
  mode: 'tts';
  sentences: string[];
  segments?: never;
  audioUrl?: never;
}

export type ListenAlongProps = AudioListenAlongProps | TtsListenAlongProps;

type PlayerMode = 'continuous' | 'shadow';

interface ListenRow {
  idx: number;
  text: string;
  startMs?: number;
  endMs?: number;
}

interface ActiveListenWord {
  segmentIdx: number;
  wordIndex: number;
}

export default function ListenAlong(props: ListenAlongProps) {
  const { lesson, knownWordsMap, wordPanelOpen = false, onWordClick, onExit } = props;
  const isTts = props.mode === 'tts';
  const segments = isTts ? null : props.segments;
  const audioUrl = isTts ? undefined : props.audioUrl;
  const sentences = isTts ? props.sentences : null;

  const t = useTranslations('reader.listen');
  const locale = useLocale();
  const activeLang = useActiveLanguage();
  // Tokenize by the LESSON's language, same rule as MarkdownReader.
  const pack =
    lesson.language && isValidLanguageCode(lesson.language)
      ? getLanguageConfig(lesson.language)
      : activeLang;
  const languageName = languageDisplayName(pack.code, locale, pack.name);
  const segmentation = useMemo(
    () => makeWordSegmentation(parseSegmentWords(lesson.segmentWords)),
    [lesson.segmentWords],
  );

  const rows: ListenRow[] = useMemo(() => {
    if (sentences) {
      return sentences.map((text, idx) => ({ idx, text }));
    }
    return (segments ?? []).map((segment) => ({
      idx: segment.idx,
      text: segment.text,
      startMs: segment.startMs,
      endMs: segment.endMs,
    }));
  }, [segments, sentences]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const unitPlayerRef = useRef<UnitPlayer | null>(null);
  const ttsPlayerRef = useRef<BrowserTtsPlayer | null>(null);
  const segmentRefs = useRef<Map<number, HTMLElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [playbackMode, setPlaybackMode] = useState<PlayerMode>('continuous');
  const playbackModeRef = useRef<PlayerMode>('continuous');
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [rate, setRate] = useState(1);
  const rateRef = useRef(1);
  const [activeWord, setActiveWord] = useState<ActiveListenWord | null>(null);
  // Shadow's own pointer in audio mode (continuous derives from the playhead).
  const [shadowIdx, setShadowIdx] = useState(0);
  // Unified sentence pointer in TTS mode across both Continuous and Shadow.
  const [sentenceIdx, setSentenceIdx] = useState(0);
  const sentenceIdxRef = useRef(0);
  const [voiceProbe, setVoiceProbe] = useState<{ lang: string; hasVoice: boolean } | null>(null);
  const [ttsError, setTtsError] = useState<BrowserTtsErrorCode | null>(null);
  const trackedPlayback = useRef(false);

  const durationMs = useMemo(() => {
    if (isTts || !segments) return 0;
    return lesson.audioDurationMs ?? (segments.length ? segments[segments.length - 1].endMs : 0);
  }, [isTts, lesson.audioDurationMs, segments]);

  const playheadIdx = useMemo(
    () => (segments ? activeSegmentIndex(segments, currentMs) : 0),
    [segments, currentMs],
  );
  const clampedSentenceIdx = rows.length ? Math.min(sentenceIdx, rows.length - 1) : 0;
  const activeIdx = isTts
    ? clampedSentenceIdx
    : playbackMode === 'shadow'
      ? shadowIdx
      : playheadIdx;

  const trackAudio = useCallback(
    (event: string, outcome?: string) => {
      trackProductEvent({
        event,
        language: pack.code,
        lessonId: lesson.id,
        feature: 'listen_along',
        outcome,
      });
    },
    [lesson.id, pack.code],
  );

  const unitPlayer = useCallback((): UnitPlayer | null => {
    if (isTts || !audioRef.current) return null;
    if (!unitPlayerRef.current) unitPlayerRef.current = createAudioUnitPlayer(audioRef.current);
    return unitPlayerRef.current;
  }, [isTts]);

  const getTtsPlayer = useCallback((): BrowserTtsPlayer => {
    if (!ttsPlayerRef.current) {
      ttsPlayerRef.current = createBrowserTtsPlayer({ pack });
    }
    return ttsPlayerRef.current;
  }, [pack]);

  useEffect(() => () => unitPlayerRef.current?.dispose(), []);

  useEffect(() => {
    if (!isTts) return;
    return () => {
      ttsPlayerRef.current?.dispose();
      ttsPlayerRef.current = null;
    };
  }, [isTts, pack]);

  // Pre-warm browser voices on mount (never awaited inside click handlers so
  // iOS WKWebView honors the user gesture on Play / row tap).
  useEffect(() => {
    if (!isTts) return;
    let cancelled = false;
    void waitForVoices().then(() => {
      if (cancelled) return;
      setVoiceProbe({ lang: pack.code, hasVoice: Boolean(getVoiceForLanguage(pack.code)) });
    });
    return () => {
      cancelled = true;
    };
  }, [isTts, pack.code]);

  // Slowing down must time-stretch, not drop pitch (audio mode).
  useEffect(() => {
    if (isTts) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.preservesPitch = true;
    audio.playbackRate = rate;
  }, [isTts, rate]);

  // Word ring highlight follows the drawer: cleared whenever it's closed,
  // like the reader. Derived, not an effect — no cascading render.
  const effectiveActiveWord = wordPanelOpen ? activeWord : null;

  // Keep the active sentence in view while playing — but never while the
  // learner is mid-lookup (#433): tapping a word pauses playback, and that
  // isPlaying flip must not drag the view back under the drawer. Shadow has
  // the same wrinkle without the drawer: it pauses at every unit boundary,
  // and a bare playing→paused flip (word tap, unit end) re-centered too, so
  // shadow only scrolls when the drill actually moves or playback starts.
  const lastCenteredIdx = useRef(-1);
  useEffect(() => {
    const prevIdx = lastCenteredIdx.current;
    lastCenteredIdx.current = activeIdx;
    if (wordPanelOpen || activeIdx < 0) return;
    if (!isPlaying && (playbackMode === 'continuous' || prevIdx === activeIdx)) return;
    segmentRefs.current.get(activeIdx)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIdx, isPlaying, playbackMode, wordPanelOpen]);

  const speakSentenceAtRef = useRef<
    (idx: number, speechRate: number, cancelBeforeSpeak: boolean) => void
  >(() => {});

  const speakSentenceAt = useCallback(
    (idx: number, speechRate: number, cancelBeforeSpeak: boolean) => {
      const row = rows[idx];
      if (!row) return;
      sentenceIdxRef.current = idx;
      setSentenceIdx(idx);
      setTtsError(null);
      isPlayingRef.current = true;
      setIsPlaying(true);

      getTtsPlayer().playSentence(
        idx,
        row.text,
        speechRate,
        {
          onStart: () => {
            if (!trackedPlayback.current) {
              trackedPlayback.current = true;
              trackAudio('audio_started');
            }
          },
          onEnd: () => {
            if (playbackModeRef.current === 'continuous' && idx + 1 < rows.length) {
              // Omit cancel() inside onend during auto-advance to avoid WebKit queue stalls.
              speakSentenceAtRef.current(idx + 1, rateRef.current, false);
              return;
            }
            isPlayingRef.current = false;
            setIsPlaying(false);
            if (playbackModeRef.current === 'continuous' && idx === rows.length - 1) {
              if (trackedPlayback.current) trackAudio('audio_finished', 'success');
              trackedPlayback.current = false;
            }
          },
          onInterrupted: () => {
            isPlayingRef.current = false;
            setIsPlaying(false);
          },
          onError: (code) => {
            isPlayingRef.current = false;
            setIsPlaying(false);
            setTtsError(code);
            if (trackedPlayback.current) trackAudio('audio_finished', 'failure');
            trackedPlayback.current = false;
          },
        },
        { cancelBeforeSpeak },
      );
    },
    [getTtsPlayer, rows, trackAudio],
  );

  useEffect(() => {
    speakSentenceAtRef.current = speakSentenceAt;
  }, [speakSentenceAt]);

  const playSegment = useCallback(
    (idx: number) => {
      if (isTts) {
        speakSentenceAt(idx, rateRef.current, true);
        return;
      }
      const segment = segments?.[idx];
      if (!segment) return;
      unitPlayer()?.playUnit(segment.startMs, segment.endMs);
    },
    [isTts, segments, speakSentenceAt, unitPlayer],
  );

  const handlePlayPause = useCallback(() => {
    if (isTts) {
      if (isPlayingRef.current) {
        ttsPlayerRef.current?.stop();
        isPlayingRef.current = false;
        setIsPlaying(false);
        return;
      }
      speakSentenceAt(sentenceIdxRef.current, rateRef.current, true);
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      // Pausing manually also cancels a shadow unit's boundary poll.
      unitPlayer()?.stop();
      return;
    }
    if (playbackMode === 'shadow') {
      playSegment(shadowIdx);
      return;
    }
    void audio.play().catch(() => {});
  }, [isPlaying, isTts, playbackMode, playSegment, shadowIdx, speakSentenceAt, unitPlayer]);

  const stepSentence = useCallback(
    (direction: -1 | 1) => {
      if (rows.length === 0) return;
      if (isTts) {
        const next = Math.min(rows.length - 1, Math.max(0, sentenceIdxRef.current + direction));
        speakSentenceAt(next, rateRef.current, true);
        return;
      }
      if (playbackMode === 'shadow') {
        const next = Math.min(rows.length - 1, Math.max(0, shadowIdx + direction));
        setShadowIdx(next);
        playSegment(next);
        return;
      }
      const audio = audioRef.current;
      if (!audio || !segments) return;
      const target = Math.min(segments.length - 1, Math.max(0, playheadIdx + direction));
      const segment = segments[target];
      if (segment) audio.currentTime = segment.startMs / 1000;
    },
    [isTts, playbackMode, playheadIdx, playSegment, rows.length, segments, shadowIdx, speakSentenceAt],
  );

  const skipSeconds = useCallback((delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, audio.currentTime + delta);
  }, []);

  const handleRateCycle = useCallback(() => {
    const nextRate = nextPlaybackRate(rateRef.current);
    rateRef.current = nextRate;
    setRate(nextRate);
    if (isTts && isPlayingRef.current) {
      // Restart synchronously inside the click handler to keep iOS gesture activation.
      speakSentenceAt(sentenceIdxRef.current, nextRate, true);
    }
  }, [isTts, speakSentenceAt]);

  const handleModeChange = useCallback(
    (next: PlayerMode) => {
      if (next === playbackMode) return;
      if (isTts) {
        ttsPlayerRef.current?.stop();
        isPlayingRef.current = false;
        setIsPlaying(false);
        playbackModeRef.current = next;
        setPlaybackMode(next);
        return;
      }
      unitPlayer()?.stop();
      if (next === 'shadow') {
        // Start the drill at the sentence the listener is on.
        setShadowIdx(Math.max(0, playheadIdx));
      }
      playbackModeRef.current = next;
      setPlaybackMode(next);
    },
    [isTts, playbackMode, playheadIdx, unitPlayer],
  );

  const handleWordTap = useCallback(
    (row: ListenRow, wordIndex: number, text: string) => {
      // Interacting with a word always pauses — the whole point is to stop and
      // look it up without losing the playhead.
      if (isTts) {
        ttsPlayerRef.current?.stop();
        isPlayingRef.current = false;
        setIsPlaying(false);
      } else {
        unitPlayer()?.stop();
      }
      // A keep-in-view glide launched at a segment boundary can still be
      // animating; a same-position programmatic scroll aborts it (#433), so
      // the view freezes where the learner tapped instead of sailing on.
      const scroller = scrollContainerRef.current;
      if (scroller) scroller.scrollTo({ top: scroller.scrollTop, behavior: 'auto' });
      setActiveWord({ segmentIdx: row.idx, wordIndex });
      onWordClick(text, row.text);
    },
    [isTts, onWordClick, unitPlayer],
  );

  const handleSeek = (valueMs: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = valueMs / 1000;
    setCurrentMs(valueMs);
  };

  const handleExit = useCallback(() => {
    unitPlayerRef.current?.dispose();
    ttsPlayerRef.current?.dispose();
    ttsPlayerRef.current = null;
    isPlayingRef.current = false;
    setIsPlaying(false);
    onExit();
  }, [onExit]);

  const ttsBannerMessage = useMemo(() => {
    if (!isTts) return null;
    if (ttsError === 'stalled') return t('speechStalled');
    if (ttsError !== null) return t('speechError');
    if (voiceProbe?.lang === pack.code && !voiceProbe.hasVoice) {
      return t('noVoiceAvailable', { language: languageName });
    }
    return null;
  }, [isTts, languageName, pack.code, t, ttsError, voiceProbe]);

  const transportButton =
    'flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40';

  return (
    <div className="flex h-full flex-col bg-card" data-testid="listen-along">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <button
          onClick={handleExit}
          data-testid="listen-along-exit"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-accent"
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="hidden sm:inline">{t('back')}</span>
        </button>
        <h1 className="mx-2 flex-1 truncate text-center text-sm font-medium text-foreground sm:text-lg">
          {lesson.title}
        </h1>
        <button
          onClick={handleExit}
          title={t('readAsText')}
          aria-label={t('readAsText')}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent"
        >
          <BookOpenText className="h-5 w-5" />
        </button>
      </header>

      {/* Segments / Sentences */}
      <div ref={scrollContainerRef} className="flex-1 overflow-auto">
        <div
          lang={pack.script.bcp47}
          dir={pack.script.direction}
          className="mx-auto max-w-[38em] px-4 py-8 sm:px-8"
          style={{ fontFamily: 'var(--font-literata), Georgia, serif' }}
        >
          {rows.map((row, idx) => {
            const isActive = idx === activeIdx;
            return (
              <p
                key={row.idx}
                ref={(el) => {
                  if (el) segmentRefs.current.set(idx, el);
                  else segmentRefs.current.delete(idx);
                }}
                data-testid="listen-segment"
                data-active-segment={isActive || undefined}
                onClick={(event) => {
                  // Row tap (not on a word) jumps playback to this sentence.
                  if ((event.target as HTMLElement).closest('[data-testid="reader-word"]')) return;
                  if (isTts) {
                    speakSentenceAt(idx, rateRef.current, true);
                  } else if (playbackMode === 'shadow') {
                    setShadowIdx(idx);
                    playSegment(idx);
                  } else {
                    handleSeek(row.startMs ?? 0);
                  }
                }}
                className={`my-1 cursor-pointer rounded-xl px-3 py-2 text-lg leading-[1.9] transition-colors sm:text-xl ${
                  isActive
                    ? 'bg-[color-mix(in_srgb,var(--clay)_12%,transparent)]'
                    : 'hover:bg-accent/50'
                }`}
              >
                {splitWords(row.text, pack, segmentation).map((part, partIndex) =>
                  part.isWord ? (
                    <WordCell
                      key={partIndex}
                      text={part.text}
                      state={lookupByVocabKeys(knownWordsMap, part.text, pack)}
                      isActive={
                        effectiveActiveWord?.segmentIdx === row.idx &&
                        effectiveActiveWord.wordIndex === partIndex
                      }
                      onActivate={(text) => handleWordTap(row, partIndex, text)}
                    />
                  ) : (
                    <span key={partIndex}>{part.text}</span>
                  ),
                )}
              </p>
            );
          })}
        </div>
      </div>

      {/* Transport */}
      <div className="border-t border-border bg-card px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-[38em]">
          {ttsBannerMessage && (
            <div
              role={ttsError ? 'alert' : 'status'}
              data-testid="listen-tts-error"
              className={`mb-2 rounded-lg border px-3 py-1.5 text-xs ${
                ttsError
                  ? 'border-destructive/40 bg-destructive/10 text-destructive'
                  : 'border-border bg-muted/60 text-muted-foreground'
              }`}
            >
              {ttsBannerMessage}
            </div>
          )}

          {/* Mode toggle + progress */}
          <div className="flex items-center justify-between gap-2 py-1">
            <div className="flex rounded-lg border border-border p-0.5 text-xs">
              {(['continuous', 'shadow'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => handleModeChange(m)}
                  data-testid={`listen-mode-${m}`}
                  className={`rounded-md px-3 py-1.5 font-medium capitalize transition-colors ${
                    playbackMode === m
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t(`mode.${m}`)}
                </button>
              ))}
            </div>
            <div className="text-xs text-muted-foreground" data-testid="listen-progress">
              {isTts
                ? t('sentenceProgress', {
                    current: rows.length ? clampedSentenceIdx + 1 : 0,
                    total: rows.length,
                  })
                : playbackMode === 'shadow'
                  ? t('sentenceProgress', {
                      current: Math.min(shadowIdx + 1, rows.length),
                      total: rows.length,
                    })
                  : `${formatClock(currentMs)} / ${formatClock(durationMs)}`}
            </div>
          </div>

          {/* Scrubber (audio continuous only) */}
          {!isTts && playbackMode === 'continuous' && (
            <input
              type="range"
              min={0}
              max={Math.max(durationMs, 1)}
              value={Math.min(currentMs, durationMs)}
              onChange={(event) => handleSeek(Number(event.target.value))}
              aria-label={t('seek')}
              data-testid="listen-scrubber"
              className="w-full accent-[var(--clay)]"
            />
          )}

          {/* Controls */}
          <div className="flex items-center justify-center gap-1 sm:gap-2">
            <button
              onClick={handleRateCycle}
              title={t('playbackSpeed')}
              data-testid="listen-speed"
              className="flex h-11 min-w-11 items-center justify-center rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {rate}×
            </button>
            <button
              onClick={() => stepSentence(-1)}
              title={t('previousSentence')}
              aria-label={t('previousSentence')}
              data-testid="listen-prev-sentence"
              className={transportButton}
            >
              <SkipBack className="h-5 w-5" />
            </button>
            {!isTts && playbackMode === 'continuous' && (
              <button
                onClick={() => skipSeconds(-SKIP_SECONDS)}
                title={t('backSeconds', { seconds: SKIP_SECONDS })}
                aria-label={t('backSeconds', { seconds: SKIP_SECONDS })}
                className={transportButton}
              >
                <Rewind className="h-5 w-5" />
              </button>
            )}
            <button
              onClick={handlePlayPause}
              title={isPlaying ? t('pause') : t('play')}
              aria-label={isPlaying ? t('pause') : t('play')}
              data-testid="listen-play-pause"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="ml-0.5 h-6 w-6" />}
            </button>
            {!isTts && playbackMode === 'continuous' && (
              <button
                onClick={() => skipSeconds(SKIP_SECONDS)}
                title={t('forwardSeconds', { seconds: SKIP_SECONDS })}
                aria-label={t('forwardSeconds', { seconds: SKIP_SECONDS })}
                className={transportButton}
              >
                <FastForward className="h-5 w-5" />
              </button>
            )}
            {playbackMode === 'shadow' && (
              <button
                onClick={() => playSegment(isTts ? clampedSentenceIdx : shadowIdx)}
                title={t('repeatSentence')}
                aria-label={t('repeatSentence')}
                data-testid="listen-repeat"
                className={transportButton}
              >
                <Repeat2 className="h-5 w-5" />
              </button>
            )}
            <button
              onClick={() => stepSentence(1)}
              title={t('nextSentence')}
              aria-label={t('nextSentence')}
              data-testid="listen-next-sentence"
              className={transportButton}
            >
              <SkipForward className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {!isTts && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          onPlay={() => {
            isPlayingRef.current = true;
            setIsPlaying(true);
            if (!trackedPlayback.current) {
              trackedPlayback.current = true;
              trackAudio('audio_started');
            }
          }}
          onPause={() => {
            isPlayingRef.current = false;
            setIsPlaying(false);
          }}
          onEnded={() => {
            isPlayingRef.current = false;
            setIsPlaying(false);
            if (trackedPlayback.current) trackAudio('audio_finished', 'success');
            trackedPlayback.current = false;
          }}
          onError={() => {
            isPlayingRef.current = false;
            setIsPlaying(false);
            trackAudio('audio_finished', 'failure');
            trackedPlayback.current = false;
          }}
          onTimeUpdate={(event) => setCurrentMs(Math.round(event.currentTarget.currentTime * 1000))}
          data-testid="listen-audio"
        />
      )}
    </div>
  );
}
