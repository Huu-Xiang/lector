'use client';

import { forgetLesson, rememberLesson } from '@/lib/offline/sync';
import { useEffect, useLayoutEffect, useState, useCallback, use, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import PageOutline from '@/components/PageOutline';
import { useQueryRefresh } from '@/lib/use-query-refresh';
import MarkdownReader from '@/components/MarkdownReader';
import OnboardingCoach from '@/components/OnboardingCoach';
import TranslationDrawer, { TranslationDrawerSlot } from '@/components/TranslationDrawer';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ListenAlong from '@/components/ListenAlong';
import { extractListenSentences } from '@/components/ListenAlong/browser-tts-player';
import {
  type AiPhraseDetails,
  type Lesson,
  type LessonSummary,
  type AudioTranscriptSegment,
  type VocabEntry,
  type VocabTranslationSource,
  type WordState,
  getEntitlements,
  createOnboardingCloze,
  getLesson,
  getLessonsForCollection,
  getLessonSegments,
  lessonAudioUrl,
  retryTranscription,
  getKnownWordsMap,
  peekKnownWordsMap,
  peekLesson,
  peekLessonsForCollection,
  QUERY_SCOPES,
  saveVocab,
  deleteVocabEntry,
  updateVocabEntry,
  getSetting,
  setSetting,
  getVocabByText,
  updateVocabState,
  updateLesson,
  incrementDailyStat,
  markVocabPushedToAnki,
  bulkUpdateWordStates,
} from '@/lib/data-layer';
import { phraseSelectionLimitPayload, showPlanLimitToast } from '@/lib/plan-limits';
import { addWordCard, addClozeCard, buildSourceLinkHtml } from '@/lib/anki';
import { queueForAnki } from '@/lib/anki-queue';
import { useAnkiTransport } from '@/lib/anki-transport';
import { useLectorMode } from '@/lib/use-env';
import {
  createKeyedGuard,
  createRepeatLookupTracker,
  resolveAutoSave,
} from '@/lib/auto-save-lookups';
import { useReadingActivity } from '@/lib/use-reading-activity';
import { trackProductEvent } from '@/lib/product-analytics';
import { useRefreshOnReturn } from '@/lib/use-refresh-on-return';
import {
  CONTENT_FILTERED,
  isAbortError,
  translateWord,
  explainWordInContext,
  explainSentence,
  translatePhrase,
  streamWordGloss,
  enrichWord,
  type SentenceExplanation,
} from '@/lib/claude';
import {
  lookupWordRemote,
  localizeEntrySenses,
  prefetchLocalizedSenses,
  cacheAcceptedTranslation,
  fetchSmartHintWords,
  type ExpandedDictionaryEntry,
} from '@/lib/dictionary-client';
import { pickPrefetchCandidates } from '@/lib/prefetch-words';
import { isTTSAvailable, speak, speakWordWithBrowser } from '@/lib/tts';
import { isComposing } from '@/lib/keyboard';
import {
  foldWord,
  getLanguageConfig,
  isValidLanguageCode,
  lookupByVocabKeys,
  makeWordSegmentation,
  tokenizeWords,
  vocabKeys,
} from '@/lib/languages';
import { parseSegmentWords } from '@/components/MarkdownReader/utils';
import {
  isWordHighlightMode,
  WORD_HIGHLIGHT_MODES,
  type WordHighlightMode,
} from '@/components/MarkdownReader/theme';
import { toast } from 'sonner';
import {
  CheckCheck,
  Headphones,
  LoaderCircle,
  MessageSquare,
  SlidersHorizontal,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import {
  applyRetranslateStart,
  buildVocabUpdatePatch,
  createKeyedVocabCoordinator,
  hydrateExistingVocab,
  isPhrasePanel,
  isSavedAiTranslationSource,
  normalizePhraseDetails,
  resolveEffectiveMeaning,
  shouldPersistAutoPhraseLookup,
  shouldPersistImmediateAiUpdate,
  type WordPanelState,
} from '../types';
import { useActiveLanguage } from '@/utils/hooks';
import { patchWordState } from '@/components/MarkdownReader/optimistic-word-state';
import type { WordSource } from '@/components/MarkdownReader/types';
import { consumeConcordanceJump, type ConcordanceJumpPayload } from '@/lib/concordance-jump';
import {
  dismissOnboarding,
  encounteredOnboardingTerms,
  getOnboardingSnapshot,
  recordLearnerEvent,
  ONBOARDING_SAVE_TARGET,
  savedOnboardingWords,
  updateOnboardingProgress,
  type OnboardingSnapshot,
} from '@/lib/onboarding';

import { loadNative } from '@/lib/library-titles';
import {
  dictionaryMeaningLang,
  expectedMeaningLanguage,
  savedMeaningFits,
  shouldAutoReplaceSavedMeaning,
  shouldUseMonolingualAiGloss,
} from '@/lib/reader-meaning';

/** The saved row under the first of `keys` that has one. */
async function findVocab(keys: string[]): Promise<VocabEntry | undefined> {
  for (const key of keys) {
    const entry = await getVocabByText(key);
    if (entry) return entry;
  }
}

function isContentFiltered(err: unknown): boolean {
  return err instanceof Error && err.message === CONTENT_FILTERED;
}

function ReadingDifficulty({ lessonId, language }: { lessonId: string; language: string }) {
  const t = useTranslations('reader.page');
  const [submitted, setSubmitted] = useState(false);
  if (submitted) return null;

  const choices = [
    { outcome: 'too_easy', label: t('analyticsTooEasy') },
    { outcome: 'just_right', label: t('analyticsJustRight') },
    { outcome: 'too_hard', label: t('analyticsTooHard') },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('analyticsDifficulty')}
        title={t('analyticsDifficulty')}
        className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
        data-testid="reading-difficulty"
      >
        <MessageSquare className="size-5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {choices.map(({ outcome, label }) => (
          <DropdownMenuItem
            key={outcome}
            onClick={() => {
              trackProductEvent({ event: 'reading_difficulty', language, lessonId, outcome });
              setSubmitted(true);
            }}
          >
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function rememberedLesson(lessonId: string): Lesson | null {
  const lesson = peekLesson(lessonId);
  return lesson && peekKnownWordsMap() ? lesson : null;
}

function keepProgress(current: Lesson | null, next: Lesson): Lesson {
  if (!current || current.id !== next.id) return next;
  return {
    ...next,
    progress_scrollPosition: current.progress_scrollPosition,
    progress_percentComplete: current.progress_percentComplete,
  };
}

export default function ReadPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId: lessonId } = use(params);
  const t = useTranslations('reader.page');
  const router = useRouter();
  const activeLang = useActiveLanguage();
  const ankiTransport = useAnkiTransport();
  const cloud = useLectorMode() === 'cloud';

  const [lesson, setLesson] = useState<Lesson | null>(() => rememberedLesson(lessonId));
  // The LESSON's pack, not the active one — same precedent as MarkdownReader.
  // An Anki export needs it (#289 4.7): a Chinese lesson read while the client
  // thinks the active language is spaced would take the regex path and throw.
  const lessonPack =
    lesson?.language && isValidLanguageCode(lesson.language)
      ? getLanguageConfig(lesson.language)
      : activeLang;
  const readingLanguage = lessonPack.code;
  const lessonSegmentation = useMemo(
    () => makeWordSegmentation(parseSegmentWords(lesson?.segmentWords)),
    [lesson?.segmentWords],
  );
  const [siblings, setSiblings] = useState<LessonSummary[]>(() => {
    const collectionId = rememberedLesson(lessonId)?.collectionId;
    return (collectionId && peekLessonsForCollection(collectionId)) || [];
  });
  const [isLoading, setIsLoading] = useState(() => rememberedLesson(lessonId) === null);
  const [error, setError] = useState<string | null>(null);
  // Listen-along (#185 & U6): audio transcript segments + client-TTS text mode toggle.
  const [segments, setSegments] = useState<AudioTranscriptSegment[]>([]);
  const [listenMode, setListenMode] = useState(false);
  const [browserTtsSupported, setBrowserTtsSupported] = useState(false);
  useEffect(() => {
    setBrowserTtsSupported(isTTSAvailable());
  }, []);
  const hasAudioSegments = segments.length > 0;
  const supportsBrowserTts =
    lessonPack.pronunciation.audio !== 'none' && lessonPack.pronunciation.audio.includes('google');
  const textSentences = useMemo(() => {
    if (
      !lesson ||
      hasAudioSegments ||
      lesson.sourceType === 'youtube' ||
      lesson.transcriptionStatus ||
      !supportsBrowserTts
    ) {
      return [];
    }
    return extractListenSentences(lesson.textContent, lessonPack);
  }, [lesson, hasAudioSegments, supportsBrowserTts, lessonPack]);
  const canTextListen =
    !hasAudioSegments &&
    Boolean(lesson) &&
    lesson?.sourceType !== 'youtube' &&
    !lesson?.transcriptionStatus &&
    supportsBrowserTts &&
    textSentences.length > 0 &&
    browserTtsSupported;
  const canListenAlong = hasAudioSegments || canTextListen;
  const isTextListenActive = listenMode && !hasAudioSegments && canTextListen;
  const [editing, setEditing] = useState(false);
  const [concordanceJump, setConcordanceJump] = useState<ConcordanceJumpPayload | null>(null);
  const consumedJumpLessonRef = useRef<string | null>(null);

  // Consume one-shot concordance jump coordinates before paint/effects so
  // MarkdownReader suppresses saved scrollPosition restoration cleanly (KTD8).
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    if (consumedJumpLessonRef.current !== lessonId) {
      consumedJumpLessonRef.current = lessonId;
      setConcordanceJump(null);
    }
    const payload = consumeConcordanceJump(lessonId, window.location.search);
    if (payload) {
      setConcordanceJump(payload);
    }
  }, [lessonId]);

  // Strip opaque jump query params from the URL once the payload is in state so
  // browser refreshes do not re-trigger jump behavior.
  useEffect(() => {
    if (!concordanceJump || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has('jump') && !params.has('segment')) return;
    params.delete('jump');
    params.delete('segment');
    const nextSearch = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`,
    );
  }, [concordanceJump]);

  const dismissConcordanceJump = useCallback(() => {
    setConcordanceJump(null);
  }, []);
  const [readerWordStates, setReaderWordStates] = useState<Map<string, WordState>>(
    () => peekKnownWordsMap() ?? new Map(),
  );
  const readerWordStatesRef = useRef(readerWordStates);
  const readerWordStateLoadRef = useRef<{
    key: string;
    promise: Promise<Map<string, WordState>>;
  } | null>(null);
  const translationRequestId = useRef(0);
  const lookupAbortRef = useRef<AbortController | null>(null);
  const contextOpSeqRef = useRef(0);
  const enrichOpSeqRef = useRef(0);
  const retranslateOpSeqRef = useRef(0);
  const cancelAllPanelAiOps = useCallback(() => {
    contextOpSeqRef.current += 1;
    enrichOpSeqRef.current += 1;
    retranslateOpSeqRef.current += 1;
  }, []);
  const vocabCoordinator = useRef(createKeyedVocabCoordinator()).current;
  const localizedExpandRequestRef = useRef<number | null>(null);
  // The one lookup whose word may be saved on its own: set for a single word
  // opened from the reader, cleared once it is used.
  const autoSaveRequestId = useRef(0);
  const trackRepeatLookup = useRef(createRepeatLookupTracker()).current;
  const [repeatLookup, setRepeatLookup] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [retranslateError, setRetranslateError] = useState<string | null>(null);
  const [clearHighlightToken, setClearHighlightToken] = useState(0);
  const [sentenceExplanation, setSentenceExplanation] = useState<SentenceExplanation | null>(null);
  const [isExplainingSentence, setIsExplainingSentence] = useState(false);
  const [sentenceExplainError, setSentenceExplainError] = useState<string | null>(null);
  const [markingRemainingKnown, setMarkingRemainingKnown] = useState(false);
  const [savedInLookup, setSavedInLookup] = useState<{ id: string; previous?: VocabEntry } | null>(
    null,
  );
  const nestedLookupRef = useRef(false);
  // For transcript lessons (#334): the segment source of the word currently in
  // the drawer, so a mined card can carry its timestamped YouTube link.
  const currentWordSourceRef = useRef<WordSource | null>(null);

  useEffect(() => () => lookupAbortRef.current?.abort(), []);

  const [wordPanel, setWordPanel] = useState<WordPanelState>({
    isOpen: false,
    word: '',
    isPhrase: false,
    sentence: '',
    translation: null,
    translationSource: null,
    savedAiTranslation: null,
    savedTranslationSource: null,
    savedSentence: null,
    partOfSpeech: null,
    dictEntry: null,
    aiContextTranslation: null,
    aiStructured: null,
    phraseDetails: null,
    isLoading: false,
    isContextLoading: false,
    isStreamingGloss: false,
    isEnriching: false,
    isDictionaryResult: false,
    error: null,
    existingEntry: null,
  });

  const [onboarding, setOnboarding] = useState<OnboardingSnapshot | null>(null);
  const onboardingLessonOpenRef = useRef<string | null>(null);
  const onboardingInProgress = onboarding?.progress?.status === 'in_progress';
  const onboardingLessonIsRecommended =
    onboardingInProgress && onboarding?.progress?.recommendedLessonId === lessonId;
  const onboardingActive =
    onboardingInProgress &&
    (onboardingLessonIsRecommended || onboarding?.progress?.language === activeLang.code);

  const refreshOnboarding = useCallback(async () => {
    try {
      const snapshot = await getOnboardingSnapshot();
      setOnboarding(snapshot);
      return snapshot;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    void refreshOnboarding();
  }, [refreshOnboarding]);

  const skipOnboardingGuide = useCallback(async () => {
    try {
      setOnboarding(await dismissOnboarding());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('onboardingSkipFailed'));
    }
  }, [t]);

  // Load lesson
  useEffect(() => {
    let cancelled = false;
    async function loadLesson() {
      try {
        const remembered = rememberedLesson(lessonId);
        const rememberedStates = peekKnownWordsMap();
        if (remembered && rememberedStates) {
          readerWordStatesRef.current = rememberedStates;
          setReaderWordStates(rememberedStates);
          setLesson((current) => keepProgress(current, remembered));
          setIsLoading(false);
        } else {
          setIsLoading(true);
        }
        const wordStateKey = `${lessonId}:${activeLang.code}`;
        if (readerWordStateLoadRef.current?.key !== wordStateKey) {
          readerWordStateLoadRef.current = {
            key: wordStateKey,
            promise: getKnownWordsMap(),
          };
        }
        const [loadedLesson, loadedWordStates] = await Promise.all([
          getLesson(lessonId),
          readerWordStateLoadRef.current.promise,
        ]);
        if (cancelled) return;

        if (!loadedLesson) {
          void forgetLesson(lessonId);
          setError(t('lessonNotFound'));
          return;
        }
        void rememberLesson(loadedLesson);

        readerWordStatesRef.current = loadedWordStates;
        setReaderWordStates(loadedWordStates);
        setLesson((current) => keepProgress(current, loadedLesson));

        // Load sibling lessons asynchronously so prev/next nav never blocks text render
        if (loadedLesson.collectionId) {
          getLessonsForCollection(loadedLesson.collectionId)
            .then((allLessons) => {
              if (!cancelled) setSiblings(allLessons);
            })
            .catch(() => {});
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Error loading lesson:', err);
        setError(err instanceof Error ? err.message : t('loadFailed'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadLesson();
    return () => {
      cancelled = true;
    };
  }, [activeLang.code, lessonId, t]);
  useQueryRefresh([QUERY_SCOPES.lessons, QUERY_SCOPES.vocab], () => {
    const collectionId = peekLesson(lessonId)?.collectionId;
    const refreshedSiblings = collectionId ? peekLessonsForCollection(collectionId) : undefined;
    if (refreshedSiblings) setSiblings(refreshedSiblings);

    getLesson(lessonId)
      .then((updated) => {
        if (updated) {
          setLesson((current) => keepProgress(current, updated));
          return;
        }
        void forgetLesson(lessonId);
        setError(t('lessonNotFound'));
      })
      .catch(() => undefined);
    getKnownWordsMap()
      .then((map) => {
        readerWordStatesRef.current = map;
        setReaderWordStates(map);
      })
      .catch(() => undefined);
  });

  const [monolingualExplanations, setMonolingualExplanations] = useState(false);
  const monolingualRef = useRef(false);
  const monolingualLoadRef = useRef<Promise<boolean> | null>(null);
  const loadMonolingualSetting = useCallback(() => {
    const request = getSetting<boolean | null>('monolingualExplanations')
      .then((value) => {
        const next = value === true;
        monolingualRef.current = next;
        setMonolingualExplanations(next);
        return next;
      })
      .catch(() => monolingualRef.current);
    monolingualLoadRef.current = request;
    return request;
  }, []);
  useEffect(() => {
    void loadMonolingualSetting();
  }, [loadMonolingualSetting]);
  useRefreshOnReturn(() => {
    void loadMonolingualSetting();
  });

  // Warm likely lookups once per lesson, after the page is idle.
  const prefetchedLessonRef = useRef<string | null>(null);
  useEffect(() => {
    if (!lesson || isLoading || prefetchedLessonRef.current === lesson.id) return;
    if (lesson.language && lesson.language !== activeLang.code) return;
    if (monolingualExplanations) return;
    const lessonKey = lesson.id;
    const words = pickPrefetchCandidates(
      lesson.textContent,
      lessonPack,
      readerWordStatesRef.current,
    );
    if (words.length === 0) return;
    let cancelled = false;
    const run = async () => {
      const [loadedNative, monolingual] = await Promise.all([
        loadNative(),
        monolingualLoadRef.current ?? loadMonolingualSetting(),
      ]);
      const native = loadedNative ?? 'en';
      if (cancelled || monolingual || native === 'en' || native === activeLang.code) return;
      prefetchedLessonRef.current = lessonKey;
      await prefetchLocalizedSenses(words, native);
    };
    const idle = (window as { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback;
    const handle = idle ? idle(() => void run()) : window.setTimeout(() => void run(), 1500);
    return () => {
      cancelled = true;
      if (idle) window.cancelIdleCallback?.(handle);
      else window.clearTimeout(handle);
    };
  }, [
    lesson,
    isLoading,
    activeLang.code,
    lessonPack,
    monolingualExplanations,
    loadMonolingualSetting,
  ]);

  // Null until the setting has loaded, and after a failed read: a lookup never saves then.
  const [autoSaveLookups, setAutoSaveLookups] = useState<boolean | null>(null);
  const [autoSaveChecked, setAutoSaveChecked] = useState(false);
  const loadAutoSaveSetting = useCallback(() => {
    getSetting<boolean | null>('autoSaveLookups')
      .then((value) => {
        const next = resolveAutoSave(value);
        if (next !== null) setAutoSaveLookups(next);
      })
      .catch(() => {})
      .finally(() => setAutoSaveChecked(true));
  }, []);
  useEffect(() => {
    loadAutoSaveSetting();
  }, [loadAutoSaveSetting]);
  useRefreshOnReturn(loadAutoSaveSetting);

  // Reader calm UX preferences:
  // - autoPronounceOnLookup defaults to false (quiet word taps; speaker button always speaks).
  // - wordHighlightMode defaults to 'saved' (soft tint on learning words, no heavy underlines).
  const [autoPronounceOnLookup, setAutoPronounceOnLookup] = useState(false);
  const autoPronounceRef = useRef(false);
  autoPronounceRef.current = autoPronounceOnLookup;
  const autoPronounceVersionRef = useRef(0);

  const [wordHighlightMode, setWordHighlightMode] = useState<WordHighlightMode>('saved');
  const highlightModeRef = useRef<WordHighlightMode>('saved');
  highlightModeRef.current = wordHighlightMode;
  const highlightModeVersionRef = useRef(0);
  const [smartHintWords, setSmartHintWords] = useState<Set<string> | undefined>(undefined);
  const [smartHintsRefreshTick, setSmartHintsRefreshTick] = useState(0);

  const loadReaderDisplaySettings = useCallback(() => {
    const pronounceVersion = autoPronounceVersionRef.current;
    getSetting<boolean | null>('autoPronounceOnLookup')
      .then((value) => {
        if (autoPronounceVersionRef.current !== pronounceVersion) return;
        if (value !== undefined) setAutoPronounceOnLookup(value === true);
      })
      .catch(() => {});

    const highlightVersion = highlightModeVersionRef.current;
    getSetting<string | null>('wordHighlightMode')
      .then((value) => {
        if (highlightModeVersionRef.current !== highlightVersion) return;
        if (isWordHighlightMode(value)) setWordHighlightMode(value);
        else if (value === null) setWordHighlightMode('saved');
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadReaderDisplaySettings();
  }, [loadReaderDisplaySettings]);
  useRefreshOnReturn(() => {
    loadReaderDisplaySettings();
    if (highlightModeRef.current === 'smart') {
      setSmartHintsRefreshTick((n) => n + 1);
    }
  });

  const handleAutoPronounceChange = useCallback(
    async (next: boolean) => {
      const myVersion = ++autoPronounceVersionRef.current;
      const previous = autoPronounceRef.current;
      autoPronounceRef.current = next;
      setAutoPronounceOnLookup(next);
      try {
        await setSetting('autoPronounceOnLookup', next);
      } catch {
        if (autoPronounceVersionRef.current === myVersion) {
          autoPronounceRef.current = previous;
          setAutoPronounceOnLookup(previous);
          toast.error(t('settingSaveFailed'));
        }
      }
    },
    [t],
  );

  const handleHighlightModeChange = useCallback(
    async (next: WordHighlightMode) => {
      const myVersion = ++highlightModeVersionRef.current;
      const previous = highlightModeRef.current;
      highlightModeRef.current = next;
      setWordHighlightMode(next);
      try {
        await setSetting('wordHighlightMode', next);
      } catch {
        if (highlightModeVersionRef.current === myVersion) {
          highlightModeRef.current = previous;
          setWordHighlightMode(previous);
          toast.error(t('settingSaveFailed'));
        }
      }
    },
    [t],
  );

  useRefreshOnReturn(() => {
    getKnownWordsMap()
      .then((map) => {
        readerWordStatesRef.current = map;
        setReaderWordStates(map);
      })
      .catch(() => {});
  });

  // Audio lesson (#185): fetch segments once transcription is done, and poll
  // the lesson while it's still transcribing so the reader unlocks by itself.
  const transcriptionStatus = lesson?.transcriptionStatus ?? null;
  const reportReadingProgress = useReadingActivity(
    lesson && (!transcriptionStatus || transcriptionStatus === 'done') ? lesson : null,
    !editing && !listenMode,
  );
  const loadedLessonId = lesson?.id;
  const trackReaderEvent = useCallback(
    (event: string, feature?: string, outcome?: string) => {
      if (loadedLessonId !== lessonId) return;
      trackProductEvent({ event, lessonId, language: readingLanguage, feature, outcome });
    },
    [lessonId, loadedLessonId, readingLanguage],
  );
  useEffect(() => {
    if (transcriptionStatus === 'done') {
      let cancelled = false;
      getLessonSegments(lessonId).then((loaded) => {
        if (!cancelled) setSegments(loaded);
      });
      return () => {
        cancelled = true;
      };
    }
    if (transcriptionStatus !== 'pending' && transcriptionStatus !== 'processing') return;
    const timer = setInterval(async () => {
      try {
        const updated = await getLesson(lessonId, { fresh: true });
        if (updated && updated.transcriptionStatus !== transcriptionStatus) setLesson(updated);
      } catch {
        /* transient — next tick retries */
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [lessonId, transcriptionStatus]);

  async function handleRetryTranscription() {
    try {
      await retryTranscription(lessonId);
      const updated = await getLesson(lessonId, { fresh: true });
      if (updated) setLesson(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('retryFailed'));
    }
  }

  // A Korean particle form saves under its noun (수탉이 → 수탉), the key vocabKeys
  // shares. A row saved before keeps its own text.
  const vocabTextOf = useCallback(
    (word: string, explicitIsPhrase?: boolean) => {
      if (wordPanel.existingEntry && wordPanel.word === word) return wordPanel.existingEntry.text;
      const folded = foldWord(word, lessonPack);
      const isPhrase =
        explicitIsPhrase ??
        (wordPanel.word === word ? isPhrasePanel(wordPanel) : word.includes(' '));
      const stem = wordPanel.word === word ? wordPanel.dictEntry?.lemmaInfo?.stem : undefined;
      if (!stem || isPhrase) return folded;
      const key = foldWord(stem, lessonPack);
      return vocabKeys(word, lessonPack).includes(key) ? key : folded;
    },
    [lessonPack, wordPanel],
  );

  const applyReaderWordState = useCallback(
    (word: string, state: WordState) => {
      const key = vocabTextOf(word);
      const patch = patchWordState(readerWordStatesRef.current, key, state);
      readerWordStatesRef.current = patch.map;
      setReaderWordStates(patch.map);

      return () => {
        const restored = patch.rollback(readerWordStatesRef.current);
        if (restored === readerWordStatesRef.current) return;
        readerWordStatesRef.current = restored;
        setReaderWordStates(restored);
      };
    },
    [vocabTextOf],
  );

  // Explicitly record a real reader open (not the background GET /lessons)
  // and remember tomorrow's next lesson. Both writes are idempotent so a
  // reload or second device resumes rather than inflating the funnel.
  useEffect(() => {
    if (!onboardingLessonIsRecommended || !lesson) return;
    if (lesson.collectionId && siblings.length === 0) return;
    if (onboardingLessonOpenRef.current === lessonId) return;
    onboardingLessonOpenRef.current = lessonId;

    const index = siblings.findIndex((candidate) => candidate.id === lessonId);
    const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;

    void Promise.all([
      recordLearnerEvent({
        eventType: 'lesson.opened',
        language: activeLang.code,
        lessonId,
        properties: { source: 'onboarding', title: lesson.title },
        idempotencyKey: `onboarding:lesson-opened:${lessonId}`,
      }),
      updateOnboardingProgress({
        currentStep: 'reader',
        nextLessonId: next?.id ?? null,
        nextLessonTitle: next?.title ?? null,
      }),
    ]).then(refreshOnboarding, () => {});
  }, [
    activeLang.code,
    lesson,
    lessonId,
    onboardingLessonIsRecommended,
    refreshOnboarding,
    siblings,
  ]);

  const trackOnboardingLookup = useCallback(
    (term: string) => {
      if (!onboardingActive) return;
      const folded = foldWord(term, activeLang);
      void recordLearnerEvent({
        eventType: 'reader.term_looked_up',
        language: activeLang.code,
        lessonId,
        properties: {
          source: 'onboarding',
          term,
          kind: term.includes(' ') ? 'phrase' : 'word',
        },
        idempotencyKey: `onboarding:lookup:${lessonId}:${folded}`,
      }).then(refreshOnboarding, () => {});
    },
    [activeLang, lessonId, onboardingActive, refreshOnboarding],
  );

  const trackOnboardingVocab = useCallback(
    async (entry: VocabEntry, state: VocabEntry['state'], saveRevision?: string) => {
      if (!onboardingActive) return null;

      const shared = {
        language: activeLang.code,
        lessonId,
        vocabId: entry.id,
        properties: { source: 'onboarding', text: entry.text, state },
      };

      try {
        await recordLearnerEvent({
          ...shared,
          eventType: 'vocab.state_changed',
          idempotencyKey: `onboarding:state:${entry.id}:${state}`,
        });

        // Only learning levels belong in the mini-review. Single words become
        // real mined cloze rows; phrases remain valuable vocab but need a
        // learner-chosen blank, so they do not count toward the three cards.
        if (state.startsWith('level') && entry.type === 'word') {
          const card = await createOnboardingCloze({
            vocabId: entry.id,
            word: entry.text,
            sentence: entry.sentence,
            translation: entry.translation,
          });
          if (card) {
            await recordLearnerEvent({
              ...shared,
              eventType: 'vocab.saved',
              properties: { ...shared.properties, practiceCardId: card.id },
              idempotencyKey: `onboarding:saved:${entry.id}${saveRevision ? `:${saveRevision}` : ''}`,
            });
          }
        }
        return await refreshOnboarding();
      } catch {
        // Learning-state persistence already succeeded. Onboarding telemetry
        // and coaching are deliberately non-blocking around the core reader.
        return null;
      }
    },
    [activeLang.code, lessonId, onboardingActive, refreshOnboarding],
  );

  // Handle word click from reader
  const handleWordClick = useCallback(
    async (
      word: string,
      sentence: string,
      source?: WordSource,
      occurrence?: string,
      options?: { browserOnlySpeech?: boolean; isPhrase?: boolean },
    ) => {
      // Abort any in-flight lookup/stream before starting the next one so rapid
      // tapping never burns AI allowance or lets stale requests overwrite state.
      lookupAbortRef.current?.abort();
      const abortController = new AbortController();
      lookupAbortRef.current = abortController;
      const signal = abortController.signal;

      // Increment requestId BEFORE any await (including entitlements check on phrases)
      // so a slow phrase entitlement read can never clobber a subsequent word tap.
      const requestId = ++translationRequestId.current;
      cancelAllPanelAiOps();

      // Remember (or clear) the transcript segment this word came from so a
      // subsequent Anki mine can attach the timestamped source link.
      currentWordSourceRef.current = source ?? null;
      const tokenizedPhraseCount = tokenizeWords(word, lessonPack, lessonSegmentation).length;
      const isPhrase = options?.isPhrase ?? (word.includes(' ') || tokenizedPhraseCount > 1);
      const nested = nestedLookupRef.current;
      nestedLookupRef.current = false;

      // Reflect the plan's phrase-selection cap before calling the API (#222).
      // The server enforces it regardless; this just turns the over-cap case
      // into an immediate upsell prompt instead of a doomed request.
      if (isPhrase) {
        const phraseWords = Math.max(
          tokenizedPhraseCount,
          word.trim().split(/\s+/).filter(Boolean).length,
          1,
        );
        const ent = await getEntitlements();
        if (requestId !== translationRequestId.current) return;
        const limitPayload = ent ? phraseSelectionLimitPayload(ent, phraseWords) : null;
        if (limitPayload) {
          showPlanLimitToast(limitPayload);
          // Force-clear any pre-applied phrase highlight even when the drawer was already closed.
          setWordPanel((prev) => ({ ...prev, isOpen: false }));
          setClearHighlightToken((n) => n + 1);
          return;
        }
      }

      localizedExpandRequestRef.current = null;
      autoSaveRequestId.current = isPhrase || nested ? 0 : requestId;
      setContextError(null);
      setRetranslateError(null);
      setSentenceExplanation(null);
      setIsExplainingSentence(false);
      setSentenceExplainError(null);
      setSavedInLookup(null);
      setRepeatLookup(
        !isPhrase &&
          !nested &&
          !!sentence.trim() &&
          trackRepeatLookup(
            `${readingLanguage}:${foldWord(word, lessonPack)}`,
            `${lessonId}:${occurrence ?? sentence.trim()}`,
          ),
      );

      if (autoPronounceRef.current) {
        const wordsToSpeak = word.split(/\s+/).slice(0, 15).join(' ');
        if (options?.browserOnlySpeech) {
          speakWordWithBrowser(wordsToSpeak, readingLanguage);
        } else {
          void speak(wordsToSpeak, undefined, readingLanguage);
        }
      }

      // Open popup immediately in loading state so keyboard shortcuts (K/X) are responsive
      setWordPanel({
        isOpen: true,
        word,
        isPhrase,
        sentence,
        translation: null,
        translationLang: null,
        translationSource: null,
        savedAiTranslation: null,
        savedTranslationSource: null,
        savedSentence: null,
        partOfSpeech: isPhrase ? 'phrase' : null,
        dictEntry: null,
        aiContextTranslation: null,
        aiStructured: null,
        phraseDetails: null,
        isLoading: true,
        isContextLoading: false,
        isStreamingGloss: false,
        isEnriching: false,
        isDictionaryResult: false,
        error: null,
        existingEntry: null,
      });

      incrementDailyStat('dictionaryLookups');
      trackReaderEvent('word_lookup', isPhrase ? 'phrase' : 'word');
      trackOnboardingLookup(word);

      const wordKey = vocabTextOf(word, isPhrase);
      const lookupPromise = findVocab(
        isPhrase ? [foldWord(word, lessonPack)] : vocabKeys(word, lessonPack),
      );
      vocabCoordinator.setEntryPromise(wordKey, lookupPromise);
      const [existingEntry, loadedNative, monolingual] = await Promise.all([
        lookupPromise,
        loadNative(),
        monolingualLoadRef.current ?? loadMonolingualSetting(),
      ]);
      if (requestId !== translationRequestId.current) return;
      const native = loadedNative ?? 'en';
      const expectedMeaningLang = expectedMeaningLanguage(readingLanguage, native, monolingual);
      const dictCacheKey = monolingual ? `mono:${readingLanguage}` : native;
      const useMonolingualGloss = shouldUseMonolingualAiGloss(readingLanguage, monolingual);
      const hasTranslation =
        !!existingEntry && savedMeaningFits(existingEntry, expectedMeaningLang);
      const canAutoReplace = shouldAutoReplaceSavedMeaning(
        existingEntry,
        readingLanguage,
        native,
        monolingual,
      );
      const hasSavedAiWordMeaning =
        !isPhrase &&
        hasTranslation &&
        (isSavedAiTranslationSource(existingEntry?.translationSource) || useMonolingualGloss);
      const replaceSavedMeaning = (
        translation: string,
        extra?: {
          translationSource?: VocabTranslationSource | null;
          phraseDetails?: AiPhraseDetails | null;
          sentence?: string;
        },
      ) => {
        if (!existingEntry || !canAutoReplace || !translation.trim()) return;
        const patch = {
          translation,
          translationLang: expectedMeaningLang,
          ...(extra?.translationSource !== undefined
            ? { translationSource: extra.translationSource }
            : {}),
          ...(extra?.phraseDetails !== undefined ? { phraseDetails: extra.phraseDetails } : {}),
          ...(extra?.sentence !== undefined ? { sentence: extra.sentence } : {}),
        };
        updateVocabEntry(existingEntry.id, patch)
          .then(() => {
            const updated: VocabEntry = { ...existingEntry, ...patch };
            vocabCoordinator.setEntryPromise(wordKey, Promise.resolve(updated));
            setWordPanel((prev) =>
              prev.existingEntry?.id === existingEntry.id
                ? {
                    ...prev,
                    existingEntry: { ...prev.existingEntry, ...patch },
                  }
                : prev,
            );
          })
          .catch(() => {});
      };

      setWordPanel((prev) => hydrateExistingVocab(prev, existingEntry, isPhrase, hasTranslation));

      if (isPhrase) {
        if (!hasTranslation) {
          try {
            const result = await translatePhrase(
              word,
              sentence,
              (cumulative) => {
                if (requestId !== translationRequestId.current) return;
                setWordPanel((prev) => ({
                  ...prev,
                  translation: cumulative,
                  translationLang: expectedMeaningLang,
                  translationSource: 'ai_phrase',
                  partOfSpeech: 'phrase',
                  isLoading: false,
                  isStreamingGloss: true,
                }));
              },
              { signal, language: readingLanguage },
            );
            if (requestId !== translationRequestId.current) return;
            const phraseDetails = normalizePhraseDetails(result);
            setWordPanel((prev) => ({
              ...prev,
              translation: result.translation,
              translationLang: expectedMeaningLang,
              translationSource: 'ai_phrase',
              partOfSpeech: 'phrase',
              phraseDetails,
              isLoading: false,
              isStreamingGloss: false,
            }));
            const latestExisting =
              (await vocabCoordinator.getEntryPromise(wordKey)?.catch(() => undefined)) ??
              existingEntry;
            if (requestId !== translationRequestId.current) return;
            if (
              shouldPersistAutoPhraseLookup(existingEntry, latestExisting, canAutoReplace) &&
              result.translation.trim()
            ) {
              const patch = {
                translation: result.translation,
                translationLang: expectedMeaningLang,
                translationSource: 'ai_phrase' as const,
                phraseDetails,
                sentence,
              };
              updateVocabEntry(latestExisting.id, patch)
                .then(() => {
                  const updated: VocabEntry = { ...latestExisting, ...patch };
                  vocabCoordinator.setEntryPromise(wordKey, Promise.resolve(updated));
                  if (requestId === translationRequestId.current) {
                    setWordPanel((prev) =>
                      prev.existingEntry?.id === latestExisting.id
                        ? { ...prev, existingEntry: updated }
                        : prev,
                    );
                  }
                })
                .catch(() => {});
            }
          } catch (err) {
            if (isAbortError(err) || requestId !== translationRequestId.current) return;
            console.error('Phrase translation error:', err);
            setWordPanel((prev) => ({
              ...prev,
              translation: null,
              translationLang: null,
              translationSource: null,
              isLoading: false,
              isStreamingGloss: false,
              error: isContentFiltered(err) ? t('aiDeclined') : t('phraseFailed'),
            }));
          }
        }
      } else {
        // For single words we ALWAYS run the dict lookup, even if vocab already
        // has a personal translation cached. Reasons:
        //   - the user expects to see senses/IPA/etymology, not just their
        //     saved gloss string
        //   - the cache (issue #100) only takes effect if we re-fetch — a
        //     previously-accepted AI translation must surface as `learned` now
        let dictEntry: ExpandedDictionaryEntry | null = null;
        try {
          dictEntry = await lookupWordRemote(word, dictCacheKey, {
            signal,
            language: readingLanguage,
          });
        } catch (err) {
          if (isAbortError(err)) return;
          dictEntry = null;
        }
        if (requestId !== translationRequestId.current) return;

        if (hasSavedAiWordMeaning) {
          // Saved AI/manual/monolingual meaning takes primary spot; skip eager dictionary
          // localization until the learner expands the collapsed dictionary section.
          if (dictEntry && dictEntry.senses.length > 0) {
            setWordPanel((prev) => ({
              ...prev,
              partOfSpeech: dictEntry!.senses[0]?.partOfSpeech || prev.partOfSpeech,
              dictEntry,
              isLoading: false,
              isDictionaryResult: false,
            }));
          } else {
            setWordPanel((prev) => ({ ...prev, isLoading: false }));
          }
          return;
        }

        if (useMonolingualGloss) {
          // Non-English monolingual lookups bypass bilingual curated senses for the
          // primary definition and stream a target-language AI gloss, keeping any
          // curated dictionary entry collapsed as secondary reference (R7).
          const secondaryDict = dictEntry && dictEntry.senses.length > 0 ? dictEntry : null;
          try {
            const gloss = await streamWordGloss(
              word,
              sentence,
              (cumulative) => {
                if (requestId !== translationRequestId.current) return;
                setWordPanel((prev) => ({
                  ...prev,
                  translation: cumulative,
                  translationLang: expectedMeaningLang,
                  translationSource: 'ai_retranslate',
                  partOfSpeech: secondaryDict?.senses[0]?.partOfSpeech || null,
                  dictEntry: secondaryDict,
                  aiStructured: null,
                  isLoading: false,
                  isStreamingGloss: true,
                  isDictionaryResult: false,
                }));
              },
              { signal, language: readingLanguage },
            );
            if (requestId !== translationRequestId.current) return;
            setWordPanel((prev) => ({
              ...prev,
              translation: gloss,
              translationLang: expectedMeaningLang,
              translationSource: 'ai_retranslate',
              partOfSpeech: secondaryDict?.senses[0]?.partOfSpeech || prev.partOfSpeech,
              dictEntry: secondaryDict,
              isLoading: false,
              isStreamingGloss: false,
              isDictionaryResult: false,
            }));
          } catch (err) {
            if (isAbortError(err) || requestId !== translationRequestId.current) return;
            console.error('Monolingual gloss stream error:', err);
            setWordPanel((prev) => ({
              ...prev,
              translation: null,
              translationLang: null,
              translationSource: null,
              dictEntry: secondaryDict,
              isLoading: false,
              isStreamingGloss: false,
              isDictionaryResult: !!secondaryDict,
              error: isContentFiltered(err) ? t('aiDeclined') : t('wordFailed'),
            }));
          }
          return;
        }

        // Keep the "looking up" state until the meanings are in the reader's language,
        // Give the translation a head start. A slow response can still replace the English fallback.
        const needsLocalization = !monolingual && !!dictEntry?.needsLocalization;
        let wasLocalized = false;
        if (needsLocalization && dictEntry) {
          const localized = await localizeEntrySenses(
            word,
            native,
            (senses) => {
              if (requestId !== translationRequestId.current) return;
              const translation = senses.map((sense) => sense.gloss).join('; ');
              replaceSavedMeaning(translation, { translationSource: 'dictionary' });
              setWordPanel((prev) =>
                prev.dictEntry?.needsLocalization
                  ? {
                      ...prev,
                      dictEntry: { ...prev.dictEntry, senses, needsLocalization: false },
                      translation,
                      translationLang: expectedMeaningLang,
                      translationSource: 'dictionary',
                    }
                  : prev,
              );
            },
            { signal, language: readingLanguage },
          );
          if (requestId !== translationRequestId.current) return;
          wasLocalized = !!localized;
          if (localized) dictEntry = { ...dictEntry, senses: localized, needsLocalization: false };
        }

        if (dictEntry && dictEntry.senses.length > 0) {
          const translation = dictEntry.senses.map((s) => s.gloss).join('; ');
          const dictSource: VocabTranslationSource = monolingual ? 'mono_dict' : 'dictionary';
          const translationLang = dictionaryMeaningLang(
            needsLocalization,
            wasLocalized,
            expectedMeaningLang,
          );
          if (translationLang === expectedMeaningLang) {
            replaceSavedMeaning(translation, { translationSource: dictSource });
          }
          setWordPanel((prev) => ({
            ...prev,
            translation,
            translationLang,
            translationSource: dictSource,
            partOfSpeech: dictEntry!.senses[0]?.partOfSpeech || null,
            dictEntry,
            isLoading: false,
            isDictionaryResult: true,
          }));
        } else if (!hasTranslation) {
          // No dict hit AND no saved vocab translation — stream a fast AI gloss.
          // The rich entry (senses/IPA/etymology) is opt-in via the Enrich button,
          // so this first paint is just a concise meaning, arriving token-by-token.
          try {
            const gloss = await streamWordGloss(
              word,
              sentence,
              (cumulative) => {
                if (requestId !== translationRequestId.current) return;
                setWordPanel((prev) => ({
                  ...prev,
                  translation: cumulative,
                  translationLang: expectedMeaningLang,
                  translationSource: monolingual ? 'ai_retranslate' : null,
                  partOfSpeech: null,
                  dictEntry: null,
                  aiStructured: null,
                  isLoading: false,
                  isStreamingGloss: true,
                  isDictionaryResult: false,
                }));
              },
              { signal, language: readingLanguage },
            );
            if (requestId !== translationRequestId.current) return;
            replaceSavedMeaning(gloss);
            setWordPanel((prev) => ({
              ...prev,
              translation: gloss,
              translationLang: expectedMeaningLang,
              translationSource: monolingual ? 'ai_retranslate' : null,
              isLoading: false,
              isStreamingGloss: false,
            }));
          } catch (err) {
            if (isAbortError(err) || requestId !== translationRequestId.current) return;
            console.error('Gloss stream error:', err);
            setWordPanel((prev) => ({
              ...prev,
              translation: null,
              translationLang: null,
              translationSource: null,
              isLoading: false,
              isStreamingGloss: false,
              error: isContentFiltered(err) ? t('aiDeclined') : t('wordFailed'),
            }));
          }
        } else {
          // No dict hit but vocab has a saved translation — show that, mark
          // not-loading. No source pill (it's the user's own translation).
          setWordPanel((prev) => ({ ...prev, isLoading: false }));
        }
      }
    },
    [
      lessonPack,
      lessonSegmentation,
      lessonId,
      loadMonolingualSetting,
      readingLanguage,
      trackOnboardingLookup,
      trackReaderEvent,
      trackRepeatLookup,
      cancelAllPanelAiOps,
      vocabCoordinator,
      vocabTextOf,
      t,
    ],
  );

  const closeWordPanel = useCallback(() => {
    translationRequestId.current += 1;
    cancelAllPanelAiOps();
    lookupAbortRef.current?.abort();
    lookupAbortRef.current = null;
    setWordPanel((prev) => ({ ...prev, isOpen: false }));
  }, [cancelAllPanelAiOps]);

  const handleTextListenWordClick = useCallback(
    (word: string, sentence: string) => {
      void handleWordClick(word, sentence, undefined, undefined, { browserOnlySpeech: true });
    },
    [handleWordClick],
  );

  // Nested lookup from inside the drawer (issue #106) — e.g. clicking "vrug"
  // in the gloss "plural of vrug". Re-targets the drawer like a reader word
  // click, keeping the sentence the user was reading so a save/known action
  // on the underlying word records where it was encountered.
  const handleNestedLookup = useCallback(
    (nestedWord: string) => {
      nestedLookupRef.current = true;
      void handleWordClick(
        nestedWord,
        wordPanel.sentence,
        undefined,
        undefined,
        isTextListenActive ? { browserOnlySpeech: true } : undefined,
      );
    },
    [handleWordClick, wordPanel.sentence, isTextListenActive],
  );

  const handleSearchInLibrary = useCallback(() => {
    const query = wordPanel.word.trim();
    if (!query) return;
    router.push(`/?q=${encodeURIComponent(query)}`);
  }, [router, wordPanel.word]);

  // Resolves the existing vocab entry for a specific panel snapshot, awaiting any
  // in-flight lookup or auto-save keyed by that word/phrase (never another word's).
  const resolveExistingEntryForPanel = useCallback(
    async (panel: WordPanelState): Promise<VocabEntry | undefined> => {
      const key = vocabTextOf(panel.word, isPhrasePanel(panel));
      const pending = vocabCoordinator.getEntryPromise(key);
      if (pending) {
        const fromLookup = await pending;
        if (fromLookup) return fromLookup;
      }
      return panel.existingEntry ?? undefined;
    },
    [vocabCoordinator, vocabTextOf],
  );

  const handleExpandDictionary = useCallback(async () => {
    const requestId = translationRequestId.current;
    if (monolingualRef.current) return;
    if (!wordPanel.dictEntry?.needsLocalization) return;
    if (localizedExpandRequestRef.current === requestId) return;
    localizedExpandRequestRef.current = requestId;
    const word = wordPanel.word;
    const native = (await loadNative()) ?? 'en';
    if (requestId !== translationRequestId.current) return;
    const applyLocalized = (senses: Array<{ partOfSpeech: string; gloss: string }>) => {
      if (requestId !== translationRequestId.current) return;
      setWordPanel((prev) =>
        prev.dictEntry?.needsLocalization
          ? { ...prev, dictEntry: { ...prev.dictEntry, senses, needsLocalization: false } }
          : prev,
      );
    };
    const localized = await localizeEntrySenses(word, native, applyLocalized);
    if (localized) applyLocalized(localized);
  }, [wordPanel.dictEntry?.needsLocalization, wordPanel.word]);

  const requestContextTranslation = useCallback(async () => {
    if (wordPanel.isContextLoading || wordPanel.aiContextTranslation) return;
    const targetPanel = wordPanel;
    const targetKey = vocabTextOf(targetPanel.word, isPhrasePanel(targetPanel));
    const requestId = translationRequestId.current;
    const opSeq = ++contextOpSeqRef.current;
    const signal = lookupAbortRef.current?.signal;
    setContextError(null);
    setWordPanel((prev) => ({ ...prev, isContextLoading: true }));
    trackReaderEvent('reading_help', 'context', 'started');
    try {
      const [result, loadedNative, monolingual] = await Promise.all([
        explainWordInContext(targetPanel.word, targetPanel.sentence, {
          signal,
          language: readingLanguage,
        }),
        loadNative(),
        monolingualLoadRef.current ?? loadMonolingualSetting(),
      ]);
      trackReaderEvent('reading_help', 'context', 'success');
      if (requestId !== translationRequestId.current || opSeq !== contextOpSeqRef.current) return;
      const expectedMeaningLang = expectedMeaningLanguage(
        readingLanguage,
        loadedNative ?? 'en',
        monolingual,
      );
      const nextTranslation = result.translation;
      const nextSentence = targetPanel.sentence;
      setWordPanel((prev) => ({
        ...prev,
        aiContextTranslation: nextTranslation,
        translationLang: expectedMeaningLang,
        translationSource: 'ai_context',
        isContextLoading: false,
      }));

      const existing = await resolveExistingEntryForPanel(targetPanel).catch(() => undefined);
      if (requestId !== translationRequestId.current || opSeq !== contextOpSeqRef.current) return;
      // Never silently overwrite a learner's custom manual translation on "In context".
      if (shouldPersistImmediateAiUpdate(existing) && existing.translationSource !== 'manual') {
        const patch = {
          translation: nextTranslation,
          translationLang: expectedMeaningLang,
          translationSource: 'ai_context' as const,
          sentence: nextSentence,
        };
        try {
          await updateVocabEntry(existing.id, patch);
          const updated: VocabEntry = { ...existing, ...patch };
          vocabCoordinator.setEntryPromise(targetKey, Promise.resolve(updated));
          if (requestId === translationRequestId.current) {
            setWordPanel((prev) => ({
              ...prev,
              existingEntry: updated,
              savedAiTranslation: nextTranslation,
              savedTranslationSource: 'ai_context',
              savedSentence: nextSentence,
            }));
          }
        } catch {
          // Non-blocking: live contextual translation stays visible in the drawer.
        }
      }
    } catch (err) {
      if (isAbortError(err)) return;
      trackReaderEvent('reading_help', 'context', 'failure');
      if (requestId !== translationRequestId.current || opSeq !== contextOpSeqRef.current) return;
      setContextError(isContentFiltered(err) ? t('aiDeclined') : t('contextFailed'));
      setWordPanel((prev) => ({ ...prev, isContextLoading: false }));
    }
  }, [
    wordPanel,
    vocabTextOf,
    vocabCoordinator,
    loadMonolingualSetting,
    readingLanguage,
    resolveExistingEntryForPanel,
    trackReaderEvent,
    t,
  ]);

  const enrichTranslation = useCallback(async () => {
    if (wordPanel.isEnriching) return;
    const targetPanel = wordPanel;
    const requestId = translationRequestId.current;
    const opSeq = ++enrichOpSeqRef.current;
    const signal = lookupAbortRef.current?.signal;
    setWordPanel((prev) => ({ ...prev, isEnriching: true }));
    trackReaderEvent('reading_help', 'enrich', 'started');
    try {
      const [result, loadedNative, monolingual] = await Promise.all([
        enrichWord(targetPanel.word, targetPanel.sentence, { signal, language: readingLanguage }),
        loadNative(),
        monolingualLoadRef.current ?? loadMonolingualSetting(),
      ]);
      trackReaderEvent('reading_help', 'enrich', 'success');
      if (requestId !== translationRequestId.current || opSeq !== enrichOpSeqRef.current) return;
      const expectedMeaningLang = expectedMeaningLanguage(
        readingLanguage,
        loadedNative ?? 'en',
        monolingual,
      );
      const structured =
        result.senses && result.senses.length > 0
          ? {
              senses: result.senses,
              ipa: result.ipa,
              etymology: result.etymology,
              relatedForms: result.relatedForms,
            }
          : null;
      setWordPanel((prev) => ({
        ...prev,
        translation: result.translation || prev.translation,
        translationLang: result.translation ? expectedMeaningLang : prev.translationLang,
        partOfSpeech: result.partOfSpeech || prev.partOfSpeech,
        aiStructured: structured ?? prev.aiStructured,
        isEnriching: false,
      }));
      // Persist rich senses into the on-device cache when the word is already saved
      // so the paid enrichment isn't discarded when the drawer closes.
      const existing = await resolveExistingEntryForPanel(targetPanel).catch(() => undefined);
      if (
        structured &&
        !monolingual &&
        existing &&
        existing.state !== 'new' &&
        requestId === translationRequestId.current
      ) {
        void cacheAcceptedTranslation({
          word: targetPanel.word,
          senses: structured.senses,
          ipa: structured.ipa,
          etymology: structured.etymology,
          relatedForms: structured.relatedForms,
          sourceSentence: targetPanel.sentence,
        });
      }
    } catch (err) {
      if (isAbortError(err)) return;
      trackReaderEvent('reading_help', 'enrich', 'failure');
      if (requestId !== translationRequestId.current || opSeq !== enrichOpSeqRef.current) return;
      console.error('Enrich error:', err);
      // Keep the gloss on screen; just stop the spinner (non-blocking failure).
      setWordPanel((prev) => ({ ...prev, isEnriching: false }));
    }
  }, [
    wordPanel,
    loadMonolingualSetting,
    readingLanguage,
    resolveExistingEntryForPanel,
    trackReaderEvent,
  ]);

  // Persist the current AI translation into the on-device dictionary cache.
  // Called from accept actions (Save / Known / level). No-op for phrases,
  // dictionary hits (already canonical), monolingual mode (cached_entries is
  // strictly bilingual per KTD5), and when the AI didn't return structured senses.
  // Fire-and-forget — never blocks the UI action.
  const persistAcceptedTranslation = useCallback(
    (panelOverride?: WordPanelState) => {
      const panel = panelOverride ?? wordPanel;
      if (monolingualRef.current) return;
      if (isPhrasePanel(panel)) return;
      if (panel.dictEntry) return;
      const preferredGloss = panel.aiContextTranslation ?? panel.translation;
      const senses =
        panel.aiStructured?.senses ??
        (preferredGloss
          ? [{ partOfSpeech: panel.partOfSpeech || '', gloss: preferredGloss }]
          : null);
      if (!senses) return;
      void cacheAcceptedTranslation({
        word: panel.word,
        senses,
        ipa: panel.aiStructured?.ipa,
        etymology: panel.aiStructured?.etymology,
        relatedForms: panel.aiStructured?.relatedForms,
        sourceSentence: panel.sentence,
      });
    },
    [wordPanel],
  );

  // `auto` is a save the user did not ask for: it never touches a word that
  // already has a state, and a failure shows nothing.
  const saveWordNow = useCallback(
    async (auto: boolean, targetPanel: WordPanelState, requestId: number) => {
      const effective = resolveEffectiveMeaning(targetPanel);
      if (!effective.translation) return;

      const isPhrase = isPhrasePanel(targetPanel);
      const key = vocabTextOf(targetPanel.word, isPhrase);
      let existing: VocabEntry | undefined;
      try {
        existing = await resolveExistingEntryForPanel(targetPanel);
      } catch {
        if (!auto) toast.error(t('saveFailed'));
        return;
      }
      if (existing && existing.state !== 'new') return;
      if (auto) {
        const readerState = lookupByVocabKeys(
          readerWordStatesRef.current,
          targetPanel.word,
          lessonPack,
        );
        const hasState = !!readerState && readerState !== 'new';
        if (existing || hasState || requestId !== translationRequestId.current) return;
      }
      const entry: VocabEntry = {
        id: existing?.id || uuidv4(),
        text: key,
        type: isPhrase ? 'phrase' : 'word',
        sentence: targetPanel.sentence,
        translation: effective.translation,
        translationLang: effective.translationLang,
        translationSource: effective.translationSource,
        phraseDetails: effective.phraseDetails,
        state: 'level1',
        stateUpdatedAt: new Date(),
        reviewCount: existing?.reviewCount || 0,
        bookId: lessonId,
        createdAt: existing?.createdAt || new Date(),
        pushedToAnki: existing?.pushedToAnki || false,
        ankiNoteId: existing?.ankiNoteId,
      };
      const existingPatch = existing
        ? buildVocabUpdatePatch(existing, targetPanel, entry.state)
        : null;
      const savedPreview: VocabEntry = existing ? { ...existing, ...existingPatch } : entry;
      const rollbackReaderState = applyReaderWordState(targetPanel.word, entry.state);

      // A failed save must not paint the word as saved (#232).
      const saving = existing
        ? updateVocabEntry(existing.id, existingPatch!)
            .then(() => existing.id)
            .catch(() => null)
        : saveVocab(entry, { silentPlanLimit: auto }).catch(() => null);
      // Keyed by this word so a queued K/X on word A still sees word A's save even if word B is clicked.
      vocabCoordinator.setEntryPromise(
        key,
        saving.then((id) => (id ? savedPreview : existing)),
      );
      const id = await saving;
      if (!id) {
        rollbackReaderState();
        if (!auto) toast.error(t('saveFailed'));
        return;
      }
      const saved = existing ? savedPreview : { ...entry, id };
      vocabCoordinator.setEntryPromise(key, Promise.resolve(saved));
      if (!existing) trackReaderEvent('word_saved', saved.type === 'phrase' ? 'phrase' : 'word');
      if (requestId === translationRequestId.current) {
        setWordPanel((prev) => ({ ...prev, existingEntry: saved }));
      }
      void incrementDailyStat('newWordsSaved', 1, { silentPlanLimit: auto }).catch(() => undefined);
      // The shared dictionary only takes meanings a reader chose to keep.
      if (!auto) persistAcceptedTranslation(targetPanel);
      await trackOnboardingVocab(saved, saved.state, existing ? uuidv4() : undefined);
      if (requestId === translationRequestId.current) setSavedInLookup({ id, previous: existing });
    },
    [
      lessonId,
      lessonPack,
      vocabCoordinator,
      resolveExistingEntryForPanel,
      applyReaderWordState,
      vocabTextOf,
      persistAcceptedTranslation,
      trackOnboardingVocab,
      trackReaderEvent,
      t,
    ],
  );

  // One save per word at a time: an S pressed during an auto-save does not post again,
  // while explicit K / X / 1-4 / Undo actions serialize per word key via vocabCoordinator.
  const saveGuard = useRef(createKeyedGuard()).current;
  const saveWordToVocab = useCallback(
    async (auto = false) => {
      const targetPanel = wordPanel;
      if (!resolveEffectiveMeaning(targetPanel).translation) return;
      const requestId = translationRequestId.current;
      const key = vocabTextOf(targetPanel.word, isPhrasePanel(targetPanel));
      await saveGuard(key, () =>
        vocabCoordinator.enqueue(key, () => saveWordNow(auto, targetPanel, requestId)),
      );
    },
    [wordPanel, vocabTextOf, saveWordNow, saveGuard, vocabCoordinator],
  );

  const undoLookupSave = useCallback(async () => {
    if (!savedInLookup || wordPanel.existingEntry?.id !== savedInLookup.id) return;
    const targetWord = wordPanel.word;
    const isPhrase = isPhrasePanel(wordPanel);
    const snapshotSaved = savedInLookup;
    const requestId = translationRequestId.current;
    const key = vocabTextOf(targetWord, isPhrase);
    await vocabCoordinator.enqueue(key, async () => {
      try {
        const { id, previous } = snapshotSaved;
        if (previous) {
          if (!(await updateVocabState(id, previous.state))) throw new Error('Undo failed');
        } else {
          await deleteVocabEntry(id);
        }
        vocabCoordinator.setEntryPromise(key, Promise.resolve(previous));
        applyReaderWordState(targetWord, 'new');
        if (requestId === translationRequestId.current) {
          setSavedInLookup(null);
          setWordPanel((prev) => ({ ...prev, existingEntry: previous ?? null }));
        }
        if (onboardingActive) {
          await recordLearnerEvent({
            eventType: 'vocab.state_changed',
            language: activeLang.code,
            lessonId,
            vocabId: id,
            properties: { source: 'onboarding', state: 'new', undoSave: true },
          })
            .then(refreshOnboarding)
            .catch(() => undefined);
        }
      } catch {
        toast.error(t('saveFailed'));
      }
    });
  }, [
    savedInLookup,
    wordPanel,
    vocabCoordinator,
    vocabTextOf,
    applyReaderWordState,
    onboardingActive,
    activeLang.code,
    lessonId,
    refreshOnboarding,
    t,
  ]);

  // Save a looked-up single word once its meaning has arrived (the lookup
  // that opened the drawer, not a nested one).
  useEffect(() => {
    if (autoSaveLookups !== true || onboarding === null) return;
    if (!wordPanel.isOpen || isPhrasePanel(wordPanel)) return;
    if (autoSaveRequestId.current !== translationRequestId.current) return;
    if (!wordPanel.translation || wordPanel.isLoading || wordPanel.isStreamingGloss) return;
    if (wordPanel.error || wordPanel.existingEntry || wordPanel.dictEntry?.needsLocalization)
      return;
    autoSaveRequestId.current = 0;
    void saveWordToVocab(true);
  }, [autoSaveLookups, onboarding, wordPanel, saveWordToVocab]);

  /** Shared serialized upsert for Known / Ignore / Level 1-4 actions on an explicit panel snapshot. */
  const persistWordPanelState = useCallback(
    async (opts: {
      panel: WordPanelState;
      requestId: number;
      resolveState: (existing: VocabEntry | undefined) => WordState;
      errorMessage: string;
      syncDrawerEntry?: boolean;
    }): Promise<{ entry: VocabEntry; state: WordState; created: boolean } | null> => {
      const { panel } = opts;
      const isPhrase = isPhrasePanel(panel);
      const key = vocabTextOf(panel.word, isPhrase);
      let existing: VocabEntry | undefined;
      try {
        existing = await resolveExistingEntryForPanel(panel);
      } catch {
        toast.error(opts.errorMessage);
        return null;
      }
      const state = opts.resolveState(existing);
      const rollbackReaderState = applyReaderWordState(panel.word, state);
      const effective = resolveEffectiveMeaning(panel);

      if (!existing) {
        const entry: VocabEntry = {
          id: uuidv4(),
          text: key,
          type: isPhrase ? 'phrase' : 'word',
          sentence: panel.sentence,
          translation: effective.translation,
          translationLang: effective.translationLang,
          translationSource: effective.translationSource,
          phraseDetails: effective.phraseDetails,
          state,
          stateUpdatedAt: new Date(),
          reviewCount: 0,
          bookId: lessonId,
          createdAt: new Date(),
          pushedToAnki: false,
        };
        const saving = saveVocab(entry).catch(() => null);
        vocabCoordinator.setEntryPromise(
          key,
          saving.then((id) => (id ? { ...entry, id } : undefined)),
        );
        const savedId = await saving;
        if (!savedId) {
          rollbackReaderState();
          toast.error(opts.errorMessage);
          return null;
        }
        const trackedEntry: VocabEntry = { ...entry, id: savedId };
        vocabCoordinator.setEntryPromise(key, Promise.resolve(trackedEntry));
        if (opts.requestId === translationRequestId.current && opts.syncDrawerEntry) {
          setWordPanel((prev) => ({ ...prev, existingEntry: trackedEntry }));
        }
        return { entry: trackedEntry, state, created: true };
      }

      const patch = buildVocabUpdatePatch(existing, panel, state);
      const updated: VocabEntry = { ...existing, ...patch, state };
      const saving = updateVocabEntry(existing.id, patch)
        .then(() => true)
        .catch(() => false);
      vocabCoordinator.setEntryPromise(
        key,
        saving.then((ok) => (ok ? updated : existing)),
      );
      if (!(await saving)) {
        rollbackReaderState();
        toast.error(opts.errorMessage);
        return null;
      }
      vocabCoordinator.setEntryPromise(key, Promise.resolve(updated));
      if (opts.requestId === translationRequestId.current && opts.syncDrawerEntry) {
        setWordPanel((prev) => ({ ...prev, existingEntry: updated }));
      }
      return { entry: updated, state, created: false };
    },
    [lessonId, vocabCoordinator, resolveExistingEntryForPanel, applyReaderWordState, vocabTextOf],
  );

  const markAsKnown = useCallback(async () => {
    const targetPanel = wordPanel;
    const requestId = translationRequestId.current;
    const key = vocabTextOf(targetPanel.word, isPhrasePanel(targetPanel));
    await vocabCoordinator.enqueue(key, async () => {
      const result = await persistWordPanelState({
        panel: targetPanel,
        requestId,
        resolveState: () => 'known',
        errorMessage: t('knownFailed'),
      });
      if (!result) return;
      await incrementDailyStat('wordsMarkedKnown');
      persistAcceptedTranslation(targetPanel);
      void trackOnboardingVocab(result.entry, 'known');
      if (requestId === translationRequestId.current) closeWordPanel();
    });
  }, [
    wordPanel,
    vocabCoordinator,
    vocabTextOf,
    persistWordPanelState,
    closeWordPanel,
    persistAcceptedTranslation,
    trackOnboardingVocab,
    t,
  ]);

  const ignoreWord = useCallback(async () => {
    const targetPanel = wordPanel;
    const requestId = translationRequestId.current;
    const key = vocabTextOf(targetPanel.word, isPhrasePanel(targetPanel));
    await vocabCoordinator.enqueue(key, async () => {
      const result = await persistWordPanelState({
        panel: targetPanel,
        requestId,
        resolveState: () => 'ignored',
        errorMessage: t('ignoreFailed'),
      });
      if (!result) return;
      void trackOnboardingVocab(result.entry, 'ignored');
      if (requestId === translationRequestId.current) closeWordPanel();
    });
  }, [
    wordPanel,
    vocabCoordinator,
    vocabTextOf,
    persistWordPanelState,
    closeWordPanel,
    trackOnboardingVocab,
    t,
  ]);

  const setWordLevel = useCallback(
    async (level: 1 | 2 | 3 | 4) => {
      const targetPanel = wordPanel;
      if (!resolveEffectiveMeaning(targetPanel).translation) return;

      const requestId = translationRequestId.current;
      const key = vocabTextOf(targetPanel.word, isPhrasePanel(targetPanel));
      const pickedState = `level${level}` as 'level1' | 'level2' | 'level3' | 'level4';
      await vocabCoordinator.enqueue(key, async () => {
        const result = await persistWordPanelState({
          panel: targetPanel,
          requestId,
          // Choosing the level that is already set clears it back to 'new'.
          resolveState: (existing) => (existing?.state === pickedState ? 'new' : pickedState),
          errorMessage: t('levelFailed'),
          syncDrawerEntry: true,
        });
        if (!result) return;
        const { entry: trackedEntry, state, created } = result;
        if (created) {
          trackReaderEvent('word_saved', trackedEntry.type === 'phrase' ? 'phrase' : 'word');
          await incrementDailyStat('newWordsSaved');
        }
        if (state !== 'new') persistAcceptedTranslation(targetPanel);
        const savedBefore = savedOnboardingWords(onboarding).length;
        const nextOnboarding = await trackOnboardingVocab(trackedEntry, state);

        if (onboardingActive && trackedEntry.type === 'word' && nextOnboarding) {
          const savedAfter = savedOnboardingWords(nextOnboarding).length;
          if (savedAfter > savedBefore) {
            toast.success(t('onboardingWordAdded', { word: targetPanel.word }), {
              id: `onboarding-saved-${trackedEntry.id}`,
              duration: 3500,
            });
            if (requestId === translationRequestId.current) closeWordPanel();
          }
        }
      });
    },
    [
      wordPanel,
      vocabCoordinator,
      vocabTextOf,
      persistWordPanelState,
      onboarding,
      onboardingActive,
      closeWordPanel,
      persistAcceptedTranslation,
      trackOnboardingVocab,
      trackReaderEvent,
      t,
    ],
  );

  const startOnboardingPractice = useCallback(async () => {
    try {
      await updateOnboardingProgress({ currentStep: 'practice' });
      router.push('/practice?onboarding=1');
    } catch {
      toast.error(t('miniReviewFailed'));
    }
  }, [router, t]);

  // The library opens the one lesson of a collection directly, so Back returns to the library.
  const handleClose = useCallback(() => {
    if (lesson?.collectionId && siblings.length !== 1) {
      router.push(`/collection/${lesson.collectionId}`);
    } else {
      router.push('/');
    }
  }, [router, lesson, siblings.length]);

  // Read Anki deck names from localStorage — same keys the Settings page writes.
  const getAnkiDecks = useCallback(() => {
    const basic = localStorage.getItem('lector-anki-deck') || activeLang.native;
    const cloze = localStorage.getItem('lector-anki-cloze-deck') || `${activeLang.native}::Cloze`;
    return { basic, cloze };
  }, [activeLang.native]);

  // Ensure a vocab entry exists for the current word and return it.
  // Creates a level1 entry if none exists, so the word appears in the vocab list.
  const ensureVocabEntry = useCallback(async (): Promise<VocabEntry> => {
    const targetPanel = wordPanel;
    const requestId = translationRequestId.current;
    const existing = await resolveExistingEntryForPanel(targetPanel);
    const isPhrase = isPhrasePanel(targetPanel);
    const key = vocabTextOf(targetPanel.word, isPhrase);
    const effective = resolveEffectiveMeaning(targetPanel);
    if (existing) {
      const nextState = existing.state === 'new' ? 'level1' : undefined;
      const patch = buildVocabUpdatePatch(existing, targetPanel, nextState);
      const needsUpdate =
        patch.state !== undefined ||
        (patch.translation !== undefined &&
          (patch.translation !== existing.translation ||
            patch.translationSource !== existing.translationSource ||
            patch.translationLang !== existing.translationLang ||
            (patch.sentence !== undefined && patch.sentence !== existing.sentence))) ||
        (patch.phraseDetails !== undefined &&
          JSON.stringify(patch.phraseDetails) !== JSON.stringify(existing.phraseDetails ?? null));
      if (!needsUpdate) return existing;
      const rollbackReaderState =
        nextState !== undefined ? applyReaderWordState(targetPanel.word, nextState) : null;
      try {
        await updateVocabEntry(existing.id, patch);
      } catch {
        rollbackReaderState?.();
        throw new Error(t('saveFailedShort'));
      }
      const updated: VocabEntry = { ...existing, ...patch };
      vocabCoordinator.setEntryPromise(key, Promise.resolve(updated));
      if (requestId === translationRequestId.current) {
        setWordPanel((prev) => ({ ...prev, existingEntry: updated }));
      }
      return updated;
    }

    const entry: VocabEntry = {
      id: uuidv4(),
      text: key,
      type: isPhrase ? 'phrase' : 'word',
      sentence: targetPanel.sentence,
      translation: effective.translation,
      translationLang: effective.translationLang,
      translationSource: effective.translationSource,
      phraseDetails: effective.phraseDetails,
      state: 'level1',
      stateUpdatedAt: new Date(),
      reviewCount: 0,
      bookId: lessonId,
      createdAt: new Date(),
      pushedToAnki: false,
    };
    const rollbackReaderState = applyReaderWordState(targetPanel.word, entry.state);
    const savedId = await saveVocab(entry);
    if (!savedId) {
      rollbackReaderState();
      throw new Error(t('saveFailedShort'));
    }
    const saved = { ...entry, id: savedId };
    vocabCoordinator.setEntryPromise(key, Promise.resolve(saved));
    await incrementDailyStat('newWordsSaved');
    trackReaderEvent('word_saved', isPhrase ? 'phrase' : 'word');
    persistAcceptedTranslation(targetPanel);
    void trackOnboardingVocab(saved, saved.state);
    if (requestId === translationRequestId.current) {
      setWordPanel((prev) => ({ ...prev, existingEntry: saved }));
    }
    return saved;
  }, [
    wordPanel,
    lessonId,
    vocabCoordinator,
    applyReaderWordState,
    vocabTextOf,
    resolveExistingEntryForPanel,
    persistAcceptedTranslation,
    trackOnboardingVocab,
    trackReaderEvent,
    t,
  ]);

  const addWordToAnki = useCallback(async () => {
    const requestId = translationRequestId.current;
    const { basic: deckName } = getAnkiDecks();
    const wordMeaning =
      (wordPanel.isDictionaryResult ? wordPanel.dictEntry?.senses[0]?.gloss : undefined) ??
      wordPanel.aiStructured?.senses[0]?.gloss ??
      wordPanel.aiContextTranslation ??
      wordPanel.savedAiTranslation ??
      wordPanel.translation ??
      '';
    const translation =
      wordPanel.aiContextTranslation ?? wordPanel.savedAiTranslation ?? wordPanel.translation ?? '';
    const source = currentWordSourceRef.current;

    const entry = await ensureVocabEntry();

    if (ankiTransport === 'addon') {
      const result = await queueForAnki([
        {
          id: entry.id,
          cardType: 'word',
          word: wordPanel.word,
          translation,
          meaning: wordMeaning,
          ...(source
            ? { sourceUrl: source.sourceUrl, clipStartMs: source.startMs, clipEndMs: source.endMs }
            : {}),
        },
      ]);
      if (result.failed.length > 0) throw new Error(result.failed[0].error);
      const pushedEntry = { ...entry, pushedToAnki: true };
      vocabCoordinator.setEntryPromise(entry.text, Promise.resolve(pushedEntry));
      if (requestId === translationRequestId.current) {
        setWordPanel((prev) => ({
          ...prev,
          existingEntry: prev.existingEntry
            ? { ...prev.existingEntry, pushedToAnki: true }
            : pushedEntry,
        }));
      }
      return;
    }

    const noteId = await addWordCard(
      deckName,
      wordPanel.word,
      translation,
      wordMeaning,
      source ? buildSourceLinkHtml(source) : undefined,
    );
    await markVocabPushedToAnki(entry.id, noteId);
    const pushedEntry = { ...entry, pushedToAnki: true, ankiNoteId: noteId };
    vocabCoordinator.setEntryPromise(entry.text, Promise.resolve(pushedEntry));
    if (requestId === translationRequestId.current) {
      setWordPanel((prev) => ({
        ...prev,
        existingEntry: prev.existingEntry
          ? { ...prev.existingEntry, pushedToAnki: true, ankiNoteId: noteId }
          : pushedEntry,
      }));
    }
  }, [wordPanel, getAnkiDecks, ensureVocabEntry, ankiTransport, vocabCoordinator]);

  const addClozeToAnki = useCallback(
    async (blankWord: string) => {
      const requestId = translationRequestId.current;
      const { cloze: clozeDeck } = getAnkiDecks();
      const translation =
        wordPanel.aiContextTranslation ??
        wordPanel.savedAiTranslation ??
        wordPanel.translation ??
        '';
      const source = currentWordSourceRef.current;

      const entry = await ensureVocabEntry();

      if (ankiTransport === 'addon') {
        const result = await queueForAnki([
          {
            id: entry.id,
            cardType: 'cloze',
            word: blankWord,
            sentence: wordPanel.word,
            translation,
            meaning: translation,
            ...(source
              ? {
                  sourceUrl: source.sourceUrl,
                  clipStartMs: source.startMs,
                  clipEndMs: source.endMs,
                }
              : {}),
          },
        ]);
        if (result.failed.length > 0) throw new Error(result.failed[0].error);
        const pushedEntry = { ...entry, pushedToAnki: true };
        vocabCoordinator.setEntryPromise(entry.text, Promise.resolve(pushedEntry));
        if (requestId === translationRequestId.current) {
          setWordPanel((prev) => ({
            ...prev,
            existingEntry: prev.existingEntry
              ? { ...prev.existingEntry, pushedToAnki: true }
              : pushedEntry,
          }));
        }
        return;
      }

      const noteId = await addClozeCard(
        clozeDeck,
        wordPanel.word,
        blankWord,
        translation,
        translation,
        source ? buildSourceLinkHtml(source) : undefined,
        lessonPack,
      );
      await markVocabPushedToAnki(entry.id, noteId);
      const pushedEntry = { ...entry, pushedToAnki: true, ankiNoteId: noteId };
      vocabCoordinator.setEntryPromise(entry.text, Promise.resolve(pushedEntry));
      if (requestId === translationRequestId.current) {
        setWordPanel((prev) => ({
          ...prev,
          existingEntry: prev.existingEntry
            ? { ...prev.existingEntry, pushedToAnki: true, ankiNoteId: noteId }
            : pushedEntry,
        }));
      }
    },
    [wordPanel, getAnkiDecks, ensureVocabEntry, ankiTransport, lessonPack, vocabCoordinator],
  );

  const retranslateWithAi = useCallback(async () => {
    if (wordPanel.isLoading || wordPanel.isStreamingGloss) return;
    const targetPanel = wordPanel;
    const isPhrase = isPhrasePanel(targetPanel);
    const targetKey = vocabTextOf(targetPanel.word, isPhrase);
    const requestId = translationRequestId.current;
    cancelAllPanelAiOps();
    const opSeq = retranslateOpSeqRef.current;
    const signal = lookupAbortRef.current?.signal;
    const before = {
      translation: targetPanel.translation,
      translationLang: targetPanel.translationLang,
      translationSource: targetPanel.translationSource,
      aiContextTranslation: targetPanel.aiContextTranslation,
      savedAiTranslation: targetPanel.savedAiTranslation,
      savedTranslationSource: targetPanel.savedTranslationSource,
      savedSentence: targetPanel.savedSentence,
      phraseDetails: targetPanel.phraseDetails,
      isDictionaryResult: targetPanel.isDictionaryResult,
    };
    setContextError(null);
    setRetranslateError(null);
    setWordPanel((prev) => applyRetranslateStart(prev));
    try {
      const [loadedNative, monolingual] = await Promise.all([
        loadNative(),
        monolingualLoadRef.current ?? loadMonolingualSetting(),
      ]);
      const expectedMeaningLang = expectedMeaningLanguage(
        readingLanguage,
        loadedNative ?? 'en',
        monolingual,
      );
      if (isPhrase) {
        const result = await translatePhrase(
          targetPanel.word,
          targetPanel.sentence,
          (cumulative) => {
            if (requestId !== translationRequestId.current || opSeq !== retranslateOpSeqRef.current)
              return;
            setWordPanel((prev) => ({
              ...prev,
              translation: cumulative,
              translationLang: expectedMeaningLang,
              translationSource: 'ai_phrase',
              isLoading: false,
              isStreamingGloss: true,
            }));
          },
          { signal, language: readingLanguage },
        );
        if (requestId !== translationRequestId.current || opSeq !== retranslateOpSeqRef.current)
          return;
        const phraseDetails = normalizePhraseDetails(result);
        setWordPanel((prev) => ({
          ...prev,
          translation: result.translation,
          translationLang: expectedMeaningLang,
          translationSource: 'ai_phrase',
          aiContextTranslation: null,
          savedAiTranslation: null,
          savedTranslationSource: null,
          savedSentence: null,
          partOfSpeech: 'phrase',
          dictEntry: null,
          phraseDetails,
          isLoading: false,
          isStreamingGloss: false,
          isDictionaryResult: false,
        }));
        const existing = await resolveExistingEntryForPanel(targetPanel).catch(() => undefined);
        if (requestId !== translationRequestId.current || opSeq !== retranslateOpSeqRef.current)
          return;
        if (shouldPersistImmediateAiUpdate(existing) && result.translation.trim()) {
          const patch = {
            translation: result.translation,
            translationLang: expectedMeaningLang,
            translationSource: 'ai_phrase' as const,
            phraseDetails,
            sentence: targetPanel.sentence,
          };
          try {
            await updateVocabEntry(existing.id, patch);
            const updated: VocabEntry = { ...existing, ...patch };
            vocabCoordinator.setEntryPromise(targetKey, Promise.resolve(updated));
            if (requestId === translationRequestId.current) {
              setWordPanel((prev) => ({ ...prev, existingEntry: updated }));
            }
          } catch {
            // Non-blocking: live translation stays visible in the drawer.
          }
        }
      } else {
        const result = await translateWord(
          targetPanel.word,
          targetPanel.sentence,
          (cumulative) => {
            if (requestId !== translationRequestId.current || opSeq !== retranslateOpSeqRef.current)
              return;
            setWordPanel((prev) => ({
              ...prev,
              translation: cumulative,
              translationLang: expectedMeaningLang,
              translationSource: 'ai_retranslate',
              isDictionaryResult: false,
              isLoading: false,
              isStreamingGloss: true,
            }));
          },
          { signal, language: readingLanguage },
        );
        if (requestId !== translationRequestId.current || opSeq !== retranslateOpSeqRef.current)
          return;
        const structured =
          result.senses && result.senses.length > 0
            ? {
                senses: result.senses,
                ipa: result.ipa,
                etymology: result.etymology,
                relatedForms: result.relatedForms,
              }
            : null;
        setWordPanel((prev) => ({
          ...prev,
          translation: result.translation,
          translationLang: expectedMeaningLang,
          translationSource: 'ai_retranslate',
          aiContextTranslation: null,
          savedAiTranslation: null,
          savedTranslationSource: null,
          savedSentence: null,
          partOfSpeech: result.partOfSpeech || prev.partOfSpeech,
          // Keep existing on-device dictEntry intact so the learner can still
          // expand "Show dictionary" below the AI re-translation.
          aiStructured: structured,
          phraseDetails: null,
          isLoading: false,
          isStreamingGloss: false,
          isDictionaryResult: false,
        }));
        const existing = await resolveExistingEntryForPanel(targetPanel).catch(() => undefined);
        if (requestId !== translationRequestId.current || opSeq !== retranslateOpSeqRef.current)
          return;
        if (shouldPersistImmediateAiUpdate(existing) && result.translation.trim()) {
          const patch = {
            translation: result.translation,
            translationLang: expectedMeaningLang,
            translationSource: 'ai_retranslate' as const,
            sentence: targetPanel.sentence,
          };
          try {
            await updateVocabEntry(existing.id, patch);
            const updated: VocabEntry = { ...existing, ...patch };
            vocabCoordinator.setEntryPromise(targetKey, Promise.resolve(updated));
            if (requestId === translationRequestId.current) {
              setWordPanel((prev) => ({ ...prev, existingEntry: updated }));
            }
          } catch {
            // Non-blocking: live translation stays visible in the drawer.
          }
        }
      }
    } catch (err) {
      if (isAbortError(err)) return;
      if (requestId !== translationRequestId.current || opSeq !== retranslateOpSeqRef.current)
        return;
      setRetranslateError(t('retranslateFailed'));
      setWordPanel((prev) => ({
        ...prev,
        ...before,
        isLoading: false,
        isStreamingGloss: false,
      }));
    }
  }, [
    wordPanel,
    vocabTextOf,
    vocabCoordinator,
    cancelAllPanelAiOps,
    loadMonolingualSetting,
    readingLanguage,
    resolveExistingEntryForPanel,
    t,
  ]);

  const handleExplainSentence = useCallback(async () => {
    const sentenceText = wordPanel.sentence.trim();
    if (!sentenceText || isExplainingSentence) return;
    const requestId = translationRequestId.current;
    const signal = lookupAbortRef.current?.signal;
    const effective = resolveEffectiveMeaning(wordPanel);
    setSentenceExplainError(null);
    setIsExplainingSentence(true);
    try {
      const result = await explainSentence({
        sentence: sentenceText,
        translation: effective.translation || wordPanel.word,
        clozeWord: wordPanel.word,
        language: readingLanguage,
        signal,
      });
      if (requestId !== translationRequestId.current) return;
      setSentenceExplanation(result);
    } catch (err) {
      if (isAbortError(err)) return;
      if (requestId !== translationRequestId.current) return;
      setSentenceExplainError(isContentFiltered(err) ? t('aiDeclined') : t('contextFailed'));
    } finally {
      if (requestId === translationRequestId.current) setIsExplainingSentence(false);
    }
  }, [wordPanel, isExplainingSentence, readingLanguage, t]);

  const handleSaveText = useCallback(
    async (newContent: string) => {
      await updateLesson(lessonId, { textContent: newContent });
      setLesson((prev) => (prev?.id === lessonId ? { ...prev, textContent: newContent } : prev));
      const collectionId = lesson?.collectionId;
      if (collectionId?.startsWith('library-')) {
        void getLessonsForCollection(collectionId, { fresh: true })
          .then((updated) => {
            setSiblings((current) =>
              current.some((entry) => entry.id === lessonId) ? updated : current,
            );
          })
          .catch(() => undefined);
      }
    },
    [lesson?.collectionId, lessonId],
  );

  const handleEditingChange = useCallback((editing: boolean) => {
    setEditing(editing);
    if (editing) {
      setWordPanel((prev) => ({ ...prev, isOpen: false }));
    }
  }, []);

  // Navigate to prev/next lesson in collection
  const currentIndex = siblings.findIndex((l) => l.id === lessonId);
  const prevLesson = currentIndex > 0 ? siblings[currentIndex - 1] : null;
  const nextLesson = currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null;
  const sectionTitle = (entry?: LessonSummary) =>
    entry?.sectionNumber === undefined
      ? undefined
      : t('readingSection', { number: entry.sectionNumber });
  const lessonLink = (entry?: LessonSummary | null) =>
    entry ? { id: entry.id, title: sectionTitle(entry) ?? entry.title } : null;

  // Handle keyboard shortcuts when the drawer is open
  useEffect(() => {
    if (!wordPanel.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // These shortcuts are bare letters and digits bound on window with
      // capture, so an IME candidate pick would trigger them (#289 4.5): typing
      // Chinese anywhere on this page with the drawer open would set word level.
      if (isComposing(e)) return;
      // Never hijack typing inside inputs, textareas, selects, contenteditables,
      // or the floating ChatWidget panel while the drawer is open.
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          'input, textarea, select, [contenteditable="true"], [data-testid="chat-panel"]',
        )
      ) {
        return;
      }
      // Cmd/Ctrl+C copies the word or phrase the drawer is showing. Word spans
      // keep the whitespace between them in the DOM, so this — like a native
      // copy — preserves spaces (readers that drop inter-word gaps copy e.g.
      // "diegroothond"). If the user has made a real text selection, defer to
      // the browser so an ordinary copy still works.
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'c') {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && selection.toString().trim()) return;
        if (!wordPanel.word) return;
        e.preventDefault();
        void navigator.clipboard?.writeText(wordPanel.word).then(
          () => toast.success(t('copied'), { duration: 1200 }),
          () => {},
        );
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Defer to any open menu/popover (reader display dropdown or drawer overflow
      // menu) so Esc/letter shortcuts never close the drawer or mutate vocab behind it.
      if (
        document.querySelector(
          '[data-slot="dropdown-menu-content"][data-open], [data-testid="drawer-more-menu"]',
        )
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'escape') {
        e.preventDefault();
        e.stopPropagation();
        closeWordPanel();
      } else if (key === 'k') {
        e.preventDefault();
        e.stopPropagation();
        markAsKnown();
      } else if (key === 'x') {
        e.preventDefault();
        e.stopPropagation();
        ignoreWord();
      } else if (
        key === 's' &&
        (!wordPanel.existingEntry || wordPanel.existingEntry.state === 'new') &&
        (wordPanel.aiContextTranslation || wordPanel.savedAiTranslation || wordPanel.translation) &&
        !wordPanel.isStreamingGloss
      ) {
        e.preventDefault();
        e.stopPropagation();
        saveWordToVocab();
      } else if (
        ['1', '2', '3', '4'].includes(e.key) &&
        (wordPanel.aiContextTranslation || wordPanel.savedAiTranslation || wordPanel.translation)
      ) {
        e.preventDefault();
        e.stopPropagation();
        setWordLevel(parseInt(e.key) as 1 | 2 | 3 | 4);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [
    wordPanel.isOpen,
    wordPanel.word,
    wordPanel.existingEntry,
    wordPanel.translation,
    wordPanel.aiContextTranslation,
    wordPanel.savedAiTranslation,
    wordPanel.isStreamingGloss,
    closeWordPanel,
    markAsKnown,
    ignoreWord,
    saveWordToVocab,
    setWordLevel,
    t,
  ]);

  const listenHeaderAction = useMemo(
    () => (
      <>
        {cloud && (
          <ReadingDifficulty key={lessonId} lessonId={lessonId} language={readingLanguage} />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t('displayMenu')}
            title={t('displayMenu')}
            data-testid="reader-display-menu-btn"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent active:opacity-60"
          >
            <SlidersHorizontal className="h-5 w-5" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-64 p-1.5"
            data-testid="reader-display-menu"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t('wordMarking')}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={wordHighlightMode}
                onValueChange={(value) => {
                  if (isWordHighlightMode(value)) void handleHighlightModeChange(value);
                }}
              >
                {WORD_HIGHLIGHT_MODES.map((mode) => (
                  <DropdownMenuRadioItem
                    key={mode}
                    value={mode}
                    data-testid={`highlight-mode-${mode}`}
                    className="items-start py-2"
                  >
                    <div className="flex flex-col gap-0.5 pr-2">
                      <span className="text-sm font-medium leading-tight">
                        {t(`markingMode.${mode}`)}
                      </span>
                      <span className="text-[11px] leading-snug text-muted-foreground">
                        {t(`markingModeHint.${mode}`)}
                      </span>
                    </div>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t('audioSection')}</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={autoPronounceOnLookup}
                onCheckedChange={(checked) => void handleAutoPronounceChange(checked === true)}
                data-testid="toggle-auto-pronounce"
                className="items-start py-2"
              >
                <div className="flex flex-col gap-0.5 pr-2">
                  <span className="text-sm font-medium leading-tight">{t('autoPronounce')}</span>
                  <span className="text-[11px] leading-snug text-muted-foreground">
                    {t('autoPronounceHint')}
                  </span>
                </div>
              </DropdownMenuCheckboxItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {canListenAlong && (
          <button
            onClick={() => setListenMode(true)}
            title={t('listenAlong')}
            aria-label={t('listenAlong')}
            data-testid="listen-along-toggle"
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent"
          >
            <Headphones className="h-5 w-5" />
          </button>
        )}
      </>
    ),
    [
      cloud,
      canListenAlong,
      lessonId,
      readingLanguage,
      wordHighlightMode,
      autoPronounceOnLookup,
      handleHighlightModeChange,
      handleAutoPronounceChange,
      t,
    ],
  );

  // Memoize chapter tokenization separately from readerWordStates so word clicks
  // never re-tokenize the whole chapter; strip Markdown link/image URL targets first.
  const chapterUniqueWords = useMemo(() => {
    if (!lesson?.textContent) return [] as Array<{ text: string; folded: string }>;
    const plainText = lesson.textContent.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');
    const seen = new Set<string>();
    const unique: Array<{ text: string; folded: string }> = [];
    for (const token of tokenizeWords(plainText, lessonPack, lessonSegmentation)) {
      const folded = foldWord(token.text, lessonPack);
      if (!folded || seen.has(folded)) continue;
      seen.add(folded);
      unique.push({ text: token.text, folded });
    }
    return unique;
  }, [lesson?.textContent, lessonPack, lessonSegmentation]);

  // Smart-hint mode (Kindle Word Wise style): fetch frequency-predicted hard words
  // from the server's local SQLite dictionary (zero AI cost). Chunked in batches of 400
  // (up to 1200 unique words per lesson) and cancelled on mode/lesson change.
  useEffect(() => {
    if (wordHighlightMode !== 'smart' || !lesson) {
      setSmartHintWords(undefined);
      return;
    }
    const candidates: string[] = [];
    const seen = new Set<string>();
    const pushWord = (folded: string) => {
      if (!folded || seen.has(folded) || candidates.length >= 1200) return;
      seen.add(folded);
      candidates.push(folded);
    };
    if (lesson.title) {
      for (const token of tokenizeWords(lesson.title, lessonPack, lessonSegmentation)) {
        pushWord(foldWord(token.text, lessonPack));
      }
    }
    for (const { folded } of chapterUniqueWords) {
      pushWord(folded);
    }
    if (chapterUniqueWords.length === 0 && lesson.segments) {
      try {
        const parsed = JSON.parse(lesson.segments) as Array<{ text?: string }>;
        if (Array.isArray(parsed)) {
          for (const seg of parsed) {
            if (!seg?.text) continue;
            for (const token of tokenizeWords(seg.text, lessonPack, lessonSegmentation)) {
              pushWord(foldWord(token.text, lessonPack));
            }
          }
        }
      } catch {
        /* ignore malformed transcript JSON */
      }
    }
    if (candidates.length === 0) {
      setSmartHintWords(undefined);
      return;
    }

    const controller = new AbortController();
    const run = async () => {
      const merged = new Set<string>();
      for (let i = 0; i < candidates.length; i += 400) {
        if (controller.signal.aborted) return;
        const batch = candidates.slice(i, i + 400);
        const hits = await fetchSmartHintWords(batch, readingLanguage, controller.signal);
        for (const w of hits) merged.add(w);
      }
      if (!controller.signal.aborted) {
        setSmartHintWords((prev) => {
          if (prev && prev.size === merged.size) {
            let same = true;
            for (const w of merged) {
              if (!prev.has(w)) {
                same = false;
                break;
              }
            }
            if (same) return prev;
          }
          return merged;
        });
      }
    };
    void run();
    return () => controller.abort();
  }, [
    wordHighlightMode,
    lesson,
    chapterUniqueWords,
    lessonPack,
    lessonSegmentation,
    readingLanguage,
    smartHintsRefreshTick,
  ]);

  const chapterWordStats = useMemo(() => {
    const untouchedNew: string[] = [];
    let learningCount = 0;
    for (const { text, folded } of chapterUniqueWords) {
      const state = lookupByVocabKeys(readerWordStates, text, lessonPack);
      if (!state || state === 'new') {
        untouchedNew.push(folded);
      } else if (state.startsWith('level')) {
        learningCount += 1;
      }
    }
    return { untouchedNew, learningCount };
  }, [chapterUniqueWords, lessonPack, readerWordStates]);

  const handleMarkRemainingKnown = useCallback(async () => {
    const wordsToMark = chapterWordStats.untouchedNew;
    if (wordsToMark.length === 0 || markingRemainingKnown) return;
    setMarkingRemainingKnown(true);
    const prevMap = readerWordStatesRef.current;
    const nextMap = new Map(prevMap);
    for (const w of wordsToMark) nextMap.set(w, 'known');
    readerWordStatesRef.current = nextMap;
    setReaderWordStates(nextMap);
    try {
      await bulkUpdateWordStates(
        wordsToMark.map((word) => ({ word, state: 'known' })),
        readingLanguage,
      );
      void incrementDailyStat('wordsMarkedKnown', wordsToMark.length).catch(() => undefined);
      toast.success(t('markedRemainingKnown', { count: wordsToMark.length }), {
        action: {
          label: t('undoMarkRemaining'),
          onClick: () => {
            // Only revert words that are still marked 'known' so newly saved words stay intact.
            const beforeUndo = readerWordStatesRef.current;
            const stillKnown = wordsToMark.filter((w) => beforeUndo.get(w) === 'known');
            if (stillKnown.length === 0) return;
            const reverted = new Map(beforeUndo);
            for (const w of stillKnown) reverted.delete(w);
            readerWordStatesRef.current = reverted;
            setReaderWordStates(reverted);
            void bulkUpdateWordStates(
              stillKnown.map((word) => ({ word, state: 'new' })),
              readingLanguage,
            ).catch(() => {
              readerWordStatesRef.current = beforeUndo;
              setReaderWordStates(beforeUndo);
              toast.error(t('knownFailed'));
            });
          },
        },
      });
    } catch {
      readerWordStatesRef.current = prevMap;
      setReaderWordStates(prevMap);
      toast.error(t('knownFailed'));
    } finally {
      setMarkingRemainingKnown(false);
    }
  }, [chapterWordStats.untouchedNew, markingRemainingKnown, readingLanguage, t]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-card px-4 py-10 sm:px-6">
        <PageOutline variant="text" />
      </div>
    );
  }

  if (error || !lesson) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-card p-8">
        <div className="mb-4 text-xl text-destructive">{error || t('lessonNotFound')}</div>
        <Button variant="secondary" onClick={() => router.push('/')}>
          {t('goToLibrary')}
        </Button>
      </div>
    );
  }

  // Audio lesson still transcribing (#185): there's no text yet, so hold the
  // reader with a status screen; the poll above unlocks it when the job lands.
  if (lesson.transcriptionStatus === 'pending' || lesson.transcriptionStatus === 'processing') {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-4 bg-card p-8"
        data-testid="transcription-pending"
      >
        <LoaderCircle className="h-8 w-8 animate-spin text-muted-foreground" />
        <div className="text-xl text-foreground">{t('transcribing')}</div>
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          {t('transcribingBody', { title: lesson.title })}
        </p>
        <Button variant="secondary" onClick={() => router.push('/')}>
          {t('backToLibrary')}
        </Button>
      </div>
    );
  }
  if (lesson.transcriptionStatus === 'error') {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-4 bg-card p-8"
        data-testid="transcription-error"
      >
        <div className="text-xl text-destructive">{t('transcriptionFailed')}</div>
        {lesson.transcriptionError && (
          <p className="max-w-md text-center text-sm text-muted-foreground">
            {lesson.transcriptionError}
          </p>
        )}
        <div className="flex gap-2">
          <Button onClick={handleRetryTranscription} data-testid="retry-transcription">
            {t('retry')}
          </Button>
          <Button variant="secondary" onClick={() => router.push('/')}>
            {t('backToLibrary')}
          </Button>
        </div>
      </div>
    );
  }

  // What the drawer renders as the rich entry: a real dictionary hit if we have
  // one, otherwise the AI's enriched structured result mapped into the same
  // shape. Kept separate from wordPanel.dictEntry (which stays null for AI) so
  // the save handlers still treat an AI result as cacheable, not a dict hit.
  const displayEntry: ExpandedDictionaryEntry | null =
    wordPanel.dictEntry ??
    (wordPanel.aiStructured
      ? {
          word: wordPanel.word,
          senses: wordPanel.aiStructured.senses,
          ipa: wordPanel.aiStructured.ipa,
          etymology: wordPanel.aiStructured.etymology,
          relatedForms: wordPanel.aiStructured.relatedForms,
        }
      : null);

  const panelIsPhrase = isPhrasePanel(wordPanel);

  // Offer Enrich only for a bare single-word gloss that isn't already rich.
  const canEnrich =
    !panelIsPhrase &&
    !wordPanel.dictEntry &&
    !wordPanel.aiStructured &&
    !!wordPanel.translation &&
    !wordPanel.isLoading &&
    !wordPanel.isStreamingGloss;

  const chapterFooter = (
    <section
      data-testid="chapter-end-card"
      className="mx-auto mt-6 mb-8 max-w-[38em] px-4 sm:px-8 print:hidden"
    >
      <div className="rounded-xl border border-border bg-muted/40 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t('chapterEndTitle')}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {chapterWordStats.untouchedNew.length > 0
                ? t('chapterEndSummary', {
                    remaining: chapterWordStats.untouchedNew.length,
                    saved: chapterWordStats.learningCount,
                  })
                : t('chapterEndAllClear', { saved: chapterWordStats.learningCount })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {chapterWordStats.untouchedNew.length > 0 && (
              <Button
                type="button"
                size="sm"
                onClick={() => void handleMarkRemainingKnown()}
                disabled={markingRemainingKnown}
                data-testid="mark-remaining-known-btn"
              >
                <CheckCheck className="mr-1.5 h-4 w-4" aria-hidden />
                {t('markRemainingKnown', { count: chapterWordStats.untouchedNew.length })}
              </Button>
            )}
            {chapterWordStats.learningCount > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => router.push('/practice')}
                data-testid="chapter-review-saved-btn"
              >
                {t('reviewChapterWords', { count: chapterWordStats.learningCount })}
              </Button>
            )}
            {!nextLesson && (
              <Button type="button" size="sm" variant="ghost" onClick={handleClose}>
                {t('backToLibrary')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );

  const onboardingSavedWords = savedOnboardingWords(onboarding);
  const onboardingSavedCount = onboardingSavedWords.length;
  const onboardingEncounteredCount = encounteredOnboardingTerms(onboarding).length;
  // After a failed read nothing is saved by itself, so the guide keeps its save step.
  const guideAutoSaves = autoSaveLookups === true;
  const onboardingCoachStage =
    onboardingSavedCount >= ONBOARDING_SAVE_TARGET
      ? 'practice'
      : onboardingEncounteredCount > 0 && !guideAutoSaves
        ? 'save'
        : 'lookup';
  const onboardingCurrentWordSaved = onboardingSavedWords.some(
    (savedWord) => savedWord.id === wordPanel.existingEntry?.id,
  );

  // Keep live non-dictionary AI primary glosses (e.g. monolingual AI gloss or
  // freshly re-translated word alongside a collapsed dictionary) distinct from
  // `savedAiTranslation` so unsaved words never show a false "AI · saved" pill
  // and keep the live streaming caret.
  const liveAiPrimaryTranslation =
    !wordPanel.savedAiTranslation &&
    !panelIsPhrase &&
    !wordPanel.isDictionaryResult &&
    wordPanel.dictEntry &&
    wordPanel.translation
      ? wordPanel.translation
      : null;

  return (
    <div className="reader-page flex min-h-0 flex-1 flex-col overflow-x-hidden bg-card 2xl:flex-row print:block print:h-auto print:overflow-visible">
      <div
        className={`relative min-h-0 flex-1 overflow-hidden print:block print:h-auto print:overflow-visible ${
          wordPanel.isOpen ? 'pb-[var(--sheet-h)] lg:pr-96 lg:pb-0 2xl:pr-0' : ''
        }`}
      >
        {listenMode && hasAudioSegments ? (
          <ListenAlong
            key={lesson.id}
            lesson={lesson}
            segments={segments}
            audioUrl={lessonAudioUrl(lesson.id)}
            knownWordsMap={readerWordStates}
            wordHighlightMode={wordHighlightMode}
            smartHintWords={wordHighlightMode === 'smart' ? smartHintWords : undefined}
            wordPanelOpen={wordPanel.isOpen}
            onWordClick={handleWordClick}
            onExit={() => setListenMode(false)}
          />
        ) : listenMode && canTextListen ? (
          <ListenAlong
            key={lesson.id}
            mode="tts"
            lesson={lesson}
            sentences={textSentences}
            knownWordsMap={readerWordStates}
            wordHighlightMode={wordHighlightMode}
            smartHintWords={wordHighlightMode === 'smart' ? smartHintWords : undefined}
            wordPanelOpen={wordPanel.isOpen}
            onWordClick={handleTextListenWordClick}
            onExit={() => setListenMode(false)}
          />
        ) : (
          <MarkdownReader
            lesson={lesson}
            sectionTitle={sectionTitle(siblings[currentIndex])}
            onWordClick={handleWordClick}
            wordPanelOpen={wordPanel.isOpen}
            onClose={handleClose}
            onClearSelection={closeWordPanel}
            onSaveText={handleSaveText}
            onEditingChange={handleEditingChange}
            onProgress={reportReadingProgress}
            knownWordsMap={readerWordStates}
            wordHighlightMode={wordHighlightMode}
            smartHintWords={wordHighlightMode === 'smart' ? smartHintWords : undefined}
            prevLesson={lessonLink(prevLesson)}
            nextLesson={lessonLink(nextLesson)}
            headerAction={listenHeaderAction}
            concordanceJump={concordanceJump}
            onDismissConcordanceJump={dismissConcordanceJump}
            chapterFooter={chapterFooter}
            clearHighlightToken={clearHighlightToken}
          />
        )}
      </div>
      <TranslationDrawerSlot>
        <TranslationDrawer
          isOpen={wordPanel.isOpen}
          word={wordPanel.word}
          isPhrase={panelIsPhrase}
          languagePack={lessonPack}
          sentence={wordPanel.sentence}
          // WordPanelState field names differ from TranslationDrawerProps; map them
          // explicitly. A spread silently dropped these (all props optional, so tsc
          // stayed green) and the drawer rendered "No definition found" for every word.
          entry={displayEntry}
          aiTranslation={wordPanel.translation}
          aiPartOfSpeech={wordPanel.partOfSpeech}
          aiContextTranslation={wordPanel.aiContextTranslation}
          liveAiPrimaryTranslation={liveAiPrimaryTranslation}
          savedAiTranslation={wordPanel.savedAiTranslation}
          savedTranslationSource={wordPanel.savedTranslationSource}
          savedSentence={wordPanel.savedSentence}
          aiPhraseDetails={wordPanel.phraseDetails}
          isDictionaryResult={wordPanel.isDictionaryResult}
          isLoading={wordPanel.isLoading}
          isContextLoading={wordPanel.isContextLoading}
          isStreaming={wordPanel.isStreamingGloss}
          isEnriching={wordPanel.isEnriching}
          error={wordPanel.error}
          retranslateError={retranslateError}
          sentenceExplanation={sentenceExplanation}
          isExplainingSentence={isExplainingSentence}
          sentenceExplainError={sentenceExplainError}
          onExplainSentence={wordPanel.sentence.trim() ? handleExplainSentence : undefined}
          existingEntry={wordPanel.existingEntry}
          wordState={lookupByVocabKeys(readerWordStates, wordPanel.word, lessonPack)}
          onboardingSaveProgress={
            onboardingActive && !panelIsPhrase
              ? {
                  savedCount: onboardingSavedCount,
                  target: ONBOARDING_SAVE_TARGET,
                  currentWordSaved: onboardingCurrentWordSaved,
                  autoSave: guideAutoSaves,
                }
              : undefined
          }
          onClose={closeWordPanel}
          onSpeak={(text) => {
            if (isTextListenActive) {
              speakWordWithBrowser(text, readingLanguage);
            } else {
              void speak(text, undefined, readingLanguage);
            }
          }}
          onSetLevel={setWordLevel}
          onMarkKnown={markAsKnown}
          onIgnore={ignoreWord}
          onRequestContextTranslation={requestContextTranslation}
          onExpandDictionary={
            !monolingualExplanations && wordPanel.dictEntry?.needsLocalization
              ? handleExpandDictionary
              : undefined
          }
          contextError={contextError}
          onSaveWord={
            (wordPanel.aiContextTranslation ||
              wordPanel.savedAiTranslation ||
              wordPanel.translation) &&
            !wordPanel.isStreamingGloss
              ? saveWordToVocab
              : undefined
          }
          onUndoSave={
            savedInLookup && wordPanel.existingEntry?.state === 'level1'
              ? undoLookupSave
              : undefined
          }
          repeatLookup={repeatLookup && autoSaveLookups === false}
          onEnrich={canEnrich ? enrichTranslation : undefined}
          onRetranslate={retranslateWithAi}
          onSearchLibrary={wordPanel.word.trim() ? handleSearchInLibrary : undefined}
          onLookupWord={handleNestedLookup}
          onAddToAnki={!cloud && !panelIsPhrase ? addWordToAnki : undefined}
          onAddCloze={!cloud && panelIsPhrase ? addClozeToAnki : undefined}
        />
      </TranslationDrawerSlot>
      {onboardingActive && autoSaveChecked && (
        <OnboardingCoach
          stage={onboardingCoachStage}
          autoSave={guideAutoSaves}
          onStartPractice={
            onboardingCoachStage === 'practice' ? startOnboardingPractice : undefined
          }
          onSkip={skipOnboardingGuide}
        />
      )}
    </div>
  );
}
