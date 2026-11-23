import {
  splitSentences,
  stripMarkdown,
  tokenizeWords,
  type LanguageConfig,
} from '@/lib/languages';
import {
  createBrowserUtterance,
  isTTSAvailable,
  onBrowserSpeechInterrupt,
  stopSpeaking,
} from '@/lib/tts';

export const SPACED_CHUNK_LIMIT = 220;
export const CJK_CHUNK_LIMIT = 70;

const DIRECT_CLAUSE_DELIMITERS = new Set([
  '—',
  '–',
  '，',
  '；',
  '：',
  '、',
  '،',
  '؛',
]);

const SPACED_CLAUSE_DELIMITERS = new Set([',', ';', ':']);

export type BrowserTtsErrorCode = 'unsupported' | 'speech_error' | 'stalled';

export interface BrowserTtsCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  /** Called when an external caller (e.g. drawer word speaker or OS audio focus) cancels the live utterance. */
  onInterrupted?: () => void;
  onError?: (code: BrowserTtsErrorCode, detail?: string) => void;
}

export interface PlaySentenceOptions {
  /**
   * Cancel active speech before speaking. Keep true (default) for user-initiated
   * starts so any active `<audio>` or speech stops cleanly; pass false when
   * auto-advancing from `onend` in Continuous mode to avoid WebKit's queue-stall
   * bug on `cancel()` inside `onend`.
   */
  cancelBeforeSpeak?: boolean;
}

export interface BrowserTtsPlayer {
  playSentence(
    index: number,
    text: string,
    rate: number,
    callbacks?: BrowserTtsCallbacks,
    options?: PlaySentenceOptions,
  ): void;
  stop(): void;
  dispose(): void;
}

export interface BrowserTtsPlayerOptions {
  pack: LanguageConfig;
  /** Optional override for stall watchdog duration (primarily for tests). */
  watchdogTimeoutMs?: (chunkText: string, rate: number, pack: LanguageConfig) => number;
}

/**
 * Extract readable sentences from a lesson's Markdown source using the shared
 * linear-time `stripMarkdown` (preserving headings) and per-pack `splitSentences`.
 * Drops empty or punctuation-only fragments so speech synthesis never stalls on
 * non-word rows.
 */
export function extractListenSentences(markdown: string, pack: LanguageConfig): string[] {
  const stripped = stripMarkdown(markdown, { keepHeadings: true });
  if (!stripped) return [];

  const sentences: string[] = [];
  for (const paragraph of stripped.split(/\n\s*\n/)) {
    const cleanParagraph = paragraph.trim();
    if (!cleanParagraph) continue;
    for (const raw of splitSentences(cleanParagraph, pack)) {
      const sentence = raw.replace(/\s+/g, ' ').trim();
      if (!sentence) continue;
      if (tokenizeWords(sentence, pack).length === 0) continue;
      sentences.push(sentence);
    }
  }
  return sentences;
}

function isClauseBreakAt(text: string, index: number): boolean {
  const ch = text[index];
  if (DIRECT_CLAUSE_DELIMITERS.has(ch)) return true;
  if (SPACED_CLAUSE_DELIMITERS.has(ch)) {
    const next = text[index + 1];
    return next === undefined || /\s/.test(next);
  }
  return false;
}

function findChunkCut(text: string, limit: number, spaced: boolean): number {
  const maxEnd = Math.min(limit, text.length);

  // Pass 1: rightmost script-aware clause delimiter that fits within limit.
  for (let i = maxEnd - 1; i >= 0; i--) {
    if (isClauseBreakAt(text, i)) {
      return i + 1;
    }
  }

  // Pass 2: word boundary (whitespace) for spaced scripts.
  if (spaced) {
    if (maxEnd < text.length && /\s/.test(text[maxEnd])) {
      return maxEnd;
    }
    for (let i = maxEnd - 1; i >= 1; i--) {
      if (/\s/.test(text[i])) {
        return i;
      }
    }
  }

  // Pass 3: hard character-boundary fallback without splitting surrogate pairs.
  let cut = maxEnd;
  if (cut > 1 && cut < text.length) {
    const code = text.charCodeAt(cut - 1);
    if (code >= 0xd800 && code <= 0xdbff) {
      cut -= 1;
    }
  }
  return Math.max(1, cut);
}

/**
 * Split a long sentence into browser-TTS-safe chunks so non-local Chrome voices
 * do not hit the ~15s cutoff while preserving natural clause boundaries across
 * Latin, CJK, and Arabic scripts.
 */
export function chunkSentenceForSpeech(
  sentence: string,
  pack: LanguageConfig,
  maxChars?: number,
): string[] {
  const spaced = pack.script.kind !== 'cjk-unspaced';
  const limit = Math.max(1, maxChars ?? (spaced ? SPACED_CHUNK_LIMIT : CJK_CHUNK_LIMIT));
  let remaining = sentence.replace(/\s+/g, ' ').trim();
  if (!remaining) return [];
  if (remaining.length <= limit) return [remaining];

  const chunks: string[] = [];
  while (remaining.length > limit) {
    const cut = findChunkCut(remaining, limit, spaced);
    const piece = remaining.slice(0, cut).trim();
    if (piece) chunks.push(piece);
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function defaultWatchdogTimeoutMs(chunkText: string, rate: number, pack: LanguageConfig): number {
  const msPerChar = pack.script.kind === 'cjk-unspaced' ? 450 : 140;
  const effectiveRate = Math.max(0.5, Number.isFinite(rate) ? rate : 1);
  const estimatedMs = (chunkText.length * msPerChar) / effectiveRate;
  return Math.max(10_000, Math.min(90_000, Math.round(estimatedMs + 10_000)));
}

/**
 * Sentence-based client Web Speech API player for zero-cost text ListenAlong
 * (`KTD9`). Safe on Chrome, Safari, and Capacitor iOS WKWebView:
 * - Invokes `speechSynthesis.speak()` synchronously inside click handlers
 * - Retains `activeUtterance` until settled against Chromium GC
 * - Guards all callbacks with a monotonic `generation` counter
 * - Omits `cancel()` during `onend` chaining to avoid WebKit queue stalls
 * - Uses a stall watchdog to recover cleanly if WebKit drops `onend`
 */
export function createBrowserTtsPlayer({
  pack,
  watchdogTimeoutMs = defaultWatchdogTimeoutMs,
}: BrowserTtsPlayerOptions): BrowserTtsPlayer {
  let generation = 0;
  let disposed = false;
  let activeUtterance: SpeechSynthesisUtterance | null = null;
  let activeCallbacks: BrowserTtsCallbacks | null = null;
  let watchdogTimer: ReturnType<typeof setTimeout> | null = null;

  const clearWatchdog = () => {
    if (watchdogTimer !== null) {
      clearTimeout(watchdogTimer);
      watchdogTimer = null;
    }
  };

  const unsubscribeInterrupt = onBrowserSpeechInterrupt(() => {
    if (disposed || !activeUtterance) return;
    const cb = activeCallbacks;
    generation += 1;
    clearWatchdog();
    activeUtterance = null;
    activeCallbacks = null;
    cb?.onInterrupted?.();
  });

  const stop = () => {
    generation += 1;
    clearWatchdog();
    activeUtterance = null;
    activeCallbacks = null;
    stopSpeaking();
  };

  return {
    playSentence(
      _index: number,
      text: string,
      rate: number,
      callbacks?: BrowserTtsCallbacks,
      options?: PlaySentenceOptions,
    ) {
      if (disposed) return;
      if (!isTTSAvailable()) {
        callbacks?.onError?.('unsupported');
        return;
      }

      generation += 1;
      const myGen = generation;
      clearWatchdog();
      activeUtterance = null;
      activeCallbacks = callbacks ?? null;

      const chunks = chunkSentenceForSpeech(text, pack);
      if (chunks.length === 0) {
        activeCallbacks = null;
        callbacks?.onEnd?.();
        return;
      }

      if (options?.cancelBeforeSpeak !== false) {
        // Stop both any playing `<audio>` clip and any prior browser speech.
        stopSpeaking();
      }

      let startedNotified = false;

      const armWatchdog = (chunkText: string) => {
        clearWatchdog();
        const timeoutMs = watchdogTimeoutMs(chunkText, rate, pack);
        watchdogTimer = setTimeout(() => {
          if (disposed || myGen !== generation) return;
          generation += 1;
          watchdogTimer = null;
          activeUtterance = null;
          activeCallbacks = null;
          if (isTTSAvailable()) {
            window.speechSynthesis.cancel();
          }
          callbacks?.onError?.('stalled');
        }, timeoutMs);
      };

      const speakChunk = (chunkIdx: number) => {
        if (disposed || myGen !== generation) return;
        const chunkText = chunks[chunkIdx];
        const utterance = createBrowserUtterance(chunkText, { language: pack.code, rate });
        // Retain strong reference against Chromium GC until utterance settles.
        activeUtterance = utterance;

        utterance.onstart = () => {
          if (disposed || myGen !== generation) return;
          armWatchdog(chunkText);
          if (!startedNotified) {
            startedNotified = true;
            callbacks?.onStart?.();
          }
        };

        utterance.onend = () => {
          if (disposed || myGen !== generation) return;
          clearWatchdog();
          if (chunkIdx + 1 < chunks.length) {
            // Chain next chunk directly without cancel() (avoids WebKit stall).
            speakChunk(chunkIdx + 1);
            return;
          }
          if (activeUtterance === utterance) activeUtterance = null;
          activeCallbacks = null;
          callbacks?.onEnd?.();
        };

        utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
          if (disposed || myGen !== generation) return;
          const errorCode = event?.error;
          clearWatchdog();
          if (activeUtterance === utterance) activeUtterance = null;
          activeCallbacks = null;
          if (errorCode === 'canceled' || errorCode === 'interrupted') {
            // Internal stop/skip already incremented `generation`, so reaching
            // here with `myGen === generation` means an external interruption
            // (drawer speech or OS audio focus). Notify caller to leave playing state.
            generation += 1;
            callbacks?.onInterrupted?.();
            return;
          }
          generation += 1;
          callbacks?.onError?.('speech_error', errorCode);
        };

        armWatchdog(chunkText);
        try {
          window.speechSynthesis.speak(utterance);
        } catch (err) {
          if (disposed || myGen !== generation) return;
          clearWatchdog();
          if (activeUtterance === utterance) activeUtterance = null;
          activeCallbacks = null;
          generation += 1;
          callbacks?.onError?.(
            'speech_error',
            err instanceof Error ? err.message : undefined,
          );
        }
      };

      // Synchronous first speak() keeps iOS WKWebView user-gesture activation intact.
      speakChunk(0);
    },

    stop,

    dispose() {
      disposed = true;
      unsubscribeInterrupt();
      stop();
    },
  };
}
