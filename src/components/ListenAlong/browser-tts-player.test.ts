import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mockActiveLang = vi.hoisted(() => ({
  code: 'fr' as 'fr' | 'zh' | 'ko' | 'ar' | 'af',
}));

vi.mock('@/lib/data-layer', () => ({
  getActiveLanguage: () => mockActiveLang.code,
  getEntitlements: vi.fn(),
}));

vi.mock('@/utils/hooks', () => ({
  useActiveLanguage: () => LANGUAGES[mockActiveLang.code],
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === 'sentenceProgress' && values) {
      return `Sentence ${values.current} of ${values.total}`;
    }
    return key;
  },
  useLocale: () => 'en',
}));

import { LANGUAGES } from '@/lib/languages';
import {
  createBrowserUtterance,
  getVoiceForLanguage,
  speakWordWithBrowser,
  waitForVoices,
} from '@/lib/tts';
import type { Lesson, WordState } from '@/types';
import ListenAlong from './index';
import { createBrowserTtsPlayer } from './browser-tts-player';

interface MockUtterance {
  text: string;
  lang: string;
  voice: SpeechSynthesisVoice | null;
  rate: number;
  pitch: number;
  volume: number;
  onstart: ((ev: Event) => void) | null;
  onend: ((ev: Event) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
}

function makeVoice(
  name: string,
  lang: string,
  localService = true,
): SpeechSynthesisVoice {
  return {
    name,
    lang,
    localService,
    default: false,
    voiceURI: name,
  } as SpeechSynthesisVoice;
}

class FakeSpeechSynthesis {
  spoken: MockUtterance[] = [];
  cancelCount = 0;
  voices: SpeechSynthesisVoice[] = [];
  private listeners = new Map<string, Set<() => void>>();

  getVoices(): SpeechSynthesisVoice[] {
    return this.voices;
  }

  speak = vi.fn((utterance: MockUtterance) => {
    this.spoken.push(utterance);
  });

  cancel = vi.fn(() => {
    this.cancelCount += 1;
  });

  addEventListener(event: string, listener: () => void) {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
  }

  removeEventListener(event: string, listener: () => void) {
    this.listeners.get(event)?.delete(listener);
  }

  emitVoicesChanged() {
    for (const listener of [...(this.listeners.get('voiceschanged') ?? [])]) {
      listener();
    }
  }
}

class FakeSpeechSynthesisUtterance implements MockUtterance {
  text: string;
  lang = '';
  voice: SpeechSynthesisVoice | null = null;
  rate = 1;
  pitch = 1;
  volume = 1;
  onstart: ((ev: Event) => void) | null = null;
  onend: ((ev: Event) => void) | null = null;
  onerror: ((ev: { error: string }) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

let synth: FakeSpeechSynthesis;
let fetchSpy: ReturnType<typeof vi.fn>;

function installBrowserSpeechMocks(voices: SpeechSynthesisVoice[] = []) {
  synth = new FakeSpeechSynthesis();
  synth.voices = voices;
  fetchSpy = vi.fn();

  const storage = new Map<string, string>();
  const mockStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  };

  vi.stubGlobal('window', { speechSynthesis: synth });
  vi.stubGlobal('localStorage', mockStorage);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeSpeechSynthesisUtterance);
  vi.stubGlobal('fetch', fetchSpy);
}

beforeEach(() => {
  mockActiveLang.code = 'fr';
  installBrowserSpeechMocks([
    makeVoice('Amelie', 'fr-FR', true),
    makeVoice('Tingting', 'zh-CN', true),
    makeVoice('Maged', 'ar-SA', true),
    makeVoice('Xander', 'nl-NL', true),
  ]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('language-aware browser voice selection and browser-only word speech', () => {
  test('matches script.bcp47 and fallback tags for zh and ar regardless of activeLanguage', () => {
    mockActiveLang.code = 'fr';

    const zhVoice = getVoiceForLanguage('zh');
    expect(zhVoice?.name).toBe('Tingting');
    expect(zhVoice?.lang).toBe('zh-CN');

    const arVoice = getVoiceForLanguage('ar');
    expect(arVoice?.name).toBe('Maged');
    expect(arVoice?.lang).toBe('ar-SA');
  });

  test('prefers target-language voice over fallbackTts, and falls back when absent', () => {
    // Only Dutch exists -> Afrikaans falls back to nl-NL
    expect(getVoiceForLanguage('af')?.name).toBe('Xander');

    // Once an Afrikaans voice exists, it beats Dutch even if Dutch has preferred name
    synth.voices = [
      makeVoice('Google Nederlands', 'nl-NL', true),
      makeVoice('Willem', 'af-ZA', false),
    ];
    expect(getVoiceForLanguage('af')?.name).toBe('Willem');
  });

  test('sets standard BCP-47 utterance.lang when no OS voice is found for zh/ar/fr', () => {
    synth.voices = [];
    expect(createBrowserUtterance('你好', { language: 'zh', rate: 1.25 }).lang).toBe('zh-CN');
    expect(createBrowserUtterance('مرحبا', { language: 'ar', rate: 1 }).lang).toBe('ar-SA');
    const frUtterance = createBrowserUtterance('Bonjour', { language: 'fr', rate: 1.25 });
    expect(frUtterance.lang).toBe('fr-FR');
    expect(frUtterance.rate).toBe(1.25);
  });

  test('speakWordWithBrowser uses speechSynthesis directly and never calls fetch(/api/tts)', () => {
    mockActiveLang.code = 'fr';
    speakWordWithBrowser('你好', 'zh');

    expect(synth.cancelCount).toBe(1);
    expect(synth.spoken).toHaveLength(1);
    expect(synth.spoken[0].text).toBe('你好');
    expect(synth.spoken[0].voice?.name).toBe('Tingting');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('honors saved localStorage voice only when it matches the requested language', () => {
    synth.voices = [
      makeVoice('Amelie', 'fr-FR', true),
      makeVoice('Thomas', 'fr-FR', false),
      makeVoice('Tingting', 'zh-CN', true),
    ];
    localStorage.setItem('lector-tts-voice', 'Thomas');

    expect(getVoiceForLanguage('fr')?.name).toBe('Thomas');
    expect(getVoiceForLanguage('zh')?.name).toBe('Tingting');
  });

  test('waitForVoices resolves when voiceschanged fires', async () => {
    synth.voices = [];
    const pending = waitForVoices();
    synth.voices = [makeVoice('Amelie', 'fr-FR')];
    synth.emitVoicesChanged();
    const loaded = await pending;
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('Amelie');
  });
});

describe('BrowserTtsPlayer', () => {
  test('invokes speechSynthesis.speak synchronously on playSentence (iOS user gesture)', () => {
    const player = createBrowserTtsPlayer({ pack: LANGUAGES.fr });
    const onStart = vi.fn();

    player.playSentence(0, 'Bonjour tout le monde.', 1, { onStart });

    // Synchronous — no microtask await before first speak()
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(synth.cancel).toHaveBeenCalledTimes(1);
    expect(synth.spoken[0].text).toBe('Bonjour tout le monde.');
    expect(synth.spoken[0].voice?.name).toBe('Amelie');
    expect(fetchSpy).not.toHaveBeenCalled();

    synth.spoken[0].onstart?.(new Event('start'));
    expect(onStart).toHaveBeenCalledTimes(1);
    player.dispose();
  });

  test('continuous auto-advance omits cancel() inside onend and pauses cleanly at N - 1', () => {
    const sentences = ['Première phrase.', 'Deuxième phrase.', 'Dernière phrase.'];
    const player = createBrowserTtsPlayer({ pack: LANGUAGES.fr });
    let currentIdx = 0;
    let playing = true;

    const playAt = (idx: number, cancelBeforeSpeak: boolean) => {
      currentIdx = idx;
      player.playSentence(
        idx,
        sentences[idx],
        1.25,
        {
          onEnd: () => {
            if (idx + 1 < sentences.length) {
              playAt(idx + 1, false);
            } else {
              playing = false;
            }
          },
        },
        { cancelBeforeSpeak },
      );
    };

    playAt(0, true);
    expect(synth.cancelCount).toBe(1);
    expect(synth.spoken).toHaveLength(1);
    expect(synth.spoken[0].rate).toBe(1.25);

    // Sentence 0 ends -> advances to 1 WITHOUT calling cancel()
    synth.spoken[0].onend?.(new Event('end'));
    expect(currentIdx).toBe(1);
    expect(synth.cancelCount).toBe(1);
    expect(synth.spoken).toHaveLength(2);
    expect(synth.spoken[1].text).toBe('Deuxième phrase.');

    // Sentence 1 ends -> advances to 2 WITHOUT calling cancel()
    synth.spoken[1].onend?.(new Event('end'));
    expect(currentIdx).toBe(2);
    expect(synth.cancelCount).toBe(1);
    expect(synth.spoken).toHaveLength(3);

    // Final sentence ends -> transitions cleanly to paused
    synth.spoken[2].onend?.(new Event('end'));
    expect(playing).toBe(false);
    expect(currentIdx).toBe(2);
    expect(fetchSpy).not.toHaveBeenCalled();
    player.dispose();
  });

  test('shadow mode completes one sentence and pauses without advancing until repeated', () => {
    const sentences = ['Première phrase.', 'Deuxième phrase.'];
    const player = createBrowserTtsPlayer({ pack: LANGUAGES.fr });
    const shadowIdx = 0;
    let playing = true;

    const playShadow = () => {
      playing = true;
      player.playSentence(shadowIdx, sentences[shadowIdx], 1, {
        onEnd: () => {
          playing = false;
        },
      });
    };

    playShadow();
    expect(synth.spoken).toHaveLength(1);
    synth.spoken[0].onend?.(new Event('end'));
    expect(playing).toBe(false);
    expect(synth.spoken).toHaveLength(1);

    // Repeat replays the same sentence synchronously
    playShadow();
    expect(synth.spoken).toHaveLength(2);
    expect(synth.spoken[1].text).toBe('Première phrase.');
    player.dispose();
  });

  test('chains multi-chunk long sentences without cancel() inside onend and calls onEnd once', () => {
    const player = createBrowserTtsPlayer({ pack: LANGUAGES.zh });
    const onStart = vi.fn();
    const onEnd = vi.fn();
    const longCjk = `${'今天天气非常好，'.repeat(12)}结束。`;

    player.playSentence(0, longCjk, 1, { onStart, onEnd });
    expect(synth.cancelCount).toBe(1);
    expect(synth.spoken).toHaveLength(1);

    synth.spoken[0].onstart?.(new Event('start'));
    synth.spoken[0].onend?.(new Event('end'));
    expect(synth.cancelCount).toBe(1);
    expect(synth.spoken).toHaveLength(2);
    expect(onEnd).not.toHaveBeenCalled();

    synth.spoken[1].onstart?.(new Event('start'));
    expect(onStart).toHaveBeenCalledTimes(1);
    synth.spoken[1].onend?.(new Event('end'));
    expect(onEnd).toHaveBeenCalledTimes(1);
    player.dispose();
  });

  test('ignores stale onend and onerror callbacks after jumping to another sentence or changing rate', () => {
    const player = createBrowserTtsPlayer({ pack: LANGUAGES.fr });
    const onEnd0 = vi.fn();
    const onError0 = vi.fn();
    const onEnd1 = vi.fn();
    const onError1 = vi.fn();

    player.playSentence(0, 'Première phrase.', 1, { onEnd: onEnd0, onError: onError0 });
    const utt0 = synth.spoken[0];

    // Jump to sentence 1 (or restart at 1.25x)
    player.playSentence(1, 'Deuxième phrase.', 1.25, { onEnd: onEnd1, onError: onError1 });
    const utt1 = synth.spoken[1];
    expect(utt1.rate).toBe(1.25);

    // Stale callbacks from sentence 0 must be completely ignored
    utt0.onerror?.({ error: 'canceled' });
    utt0.onerror?.({ error: 'synthesis-failed' });
    utt0.onend?.(new Event('end'));
    expect(onEnd0).not.toHaveBeenCalled();
    expect(onError0).not.toHaveBeenCalled();
    expect(onEnd1).not.toHaveBeenCalled();
    expect(onError1).not.toHaveBeenCalled();

    // Benign canceled/interrupted error on active utterance does not trigger onError
    utt1.onerror?.({ error: 'interrupted' });
    expect(onError1).not.toHaveBeenCalled();

    // Real error on a fresh utterance surfaces speech_error
    player.playSentence(1, 'Deuxième phrase.', 1.25, { onEnd: onEnd1, onError: onError1 });
    const utt2 = synth.spoken[2];
    utt2.onerror?.({ error: 'synthesis-failed' });
    expect(onError1).toHaveBeenCalledWith('speech_error', 'synthesis-failed');

    // Trailing onend after onerror is ignored
    utt2.onend?.(new Event('end'));
    expect(onEnd1).not.toHaveBeenCalled();
    player.dispose();
  });

  test('stall watchdog recovers cleanly to paused state when WebKit silently drops onend', () => {
    vi.useFakeTimers();
    const player = createBrowserTtsPlayer({
      pack: LANGUAGES.fr,
      watchdogTimeoutMs: () => 5000,
    });
    const onEnd = vi.fn();
    const onError = vi.fn();

    player.playSentence(0, 'Bonjour.', 1, { onEnd, onError });
    const utt = synth.spoken[0];
    const cancelsBefore = synth.cancelCount;

    vi.advanceTimersByTime(5000);
    expect(onError).toHaveBeenCalledWith('stalled');
    expect(synth.cancelCount).toBe(cancelsBefore + 1);

    // Late onend after watchdog fired is ignored
    utt.onend?.(new Event('end'));
    expect(onEnd).not.toHaveBeenCalled();
    player.dispose();
  });

  test('stop() and dispose() cancel speech and block subsequent playback/callbacks', () => {
    const player = createBrowserTtsPlayer({ pack: LANGUAGES.fr });
    const onEnd = vi.fn();

    player.playSentence(0, 'Bonjour.', 1, { onEnd });
    const utt = synth.spoken[0];

    player.stop();
    expect(synth.cancelCount).toBe(2);
    utt.onend?.(new Event('end'));
    expect(onEnd).not.toHaveBeenCalled();

    player.dispose();
    player.playSentence(0, 'Après dispose.', 1, { onEnd });
    expect(synth.spoken).toHaveLength(1);
  });
});

describe('ListenAlong static render modes', () => {
  const baseLesson: Lesson = {
    id: 'lesson-1',
    collectionId: null,
    title: 'Test Lesson',
    sortOrder: 0,
    textContent: 'Bonjour tout le monde. Comment ça va ?',
    progress_scrollPosition: 0,
    progress_percentComplete: 0,
    wordCount: 7,
    language: 'fr',
    createdAt: '2026-01-01T00:00:00Z',
    lastReadAt: '2026-01-01T00:00:00Z',
  };

  test('tts mode hides audio element and scrubber and renders Sentence k of N progress', () => {
    const html = renderToStaticMarkup(
      createElement(ListenAlong, {
        mode: 'tts',
        lesson: baseLesson,
        sentences: ['Bonjour tout le monde.', 'Comment ça va ?'],
        knownWordsMap: new Map<string, WordState>(),
        onWordClick: vi.fn(),
        onExit: vi.fn(),
      }),
    );

    expect(html).toContain('data-testid="listen-along"');
    expect(html).toContain('Sentence 1 of 2');
    expect(html).not.toContain('data-testid="listen-audio"');
    expect(html).not.toContain('data-testid="listen-scrubber"');
    expect(html).toContain('data-testid="listen-speed"');
    expect(html).toContain('data-testid="listen-play-pause"');
    expect(html).toContain('data-active-segment="true"');
  });

  test('uses stored CJK segmentWords and Korean vocabKeys coloring', () => {
    const zhLesson: Lesson = {
      ...baseLesson,
      language: 'zh',
      segmentWords: JSON.stringify(['喜欢', '读书']),
    };
    const zhHtml = renderToStaticMarkup(
      createElement(ListenAlong, {
        mode: 'tts',
        lesson: zhLesson,
        sentences: ['我喜欢读书。'],
        knownWordsMap: new Map<string, WordState>([['喜欢', 'known']]),
        onWordClick: vi.fn(),
        onExit: vi.fn(),
      }),
    );
    expect(zhHtml).toContain('>喜欢<');
    expect(zhHtml).toContain('>读书<');

    const koLesson: Lesson = {
      ...baseLesson,
      language: 'ko',
    };
    const koHtml = renderToStaticMarkup(
      createElement(ListenAlong, {
        mode: 'tts',
        lesson: koLesson,
        sentences: ['수탉이 울었다.'],
        knownWordsMap: new Map<string, WordState>([['수탉', 'level2']]),
        onWordClick: vi.fn(),
        onExit: vi.fn(),
      }),
    );
    expect(koHtml).toContain('수탉이');
    expect(koHtml).toContain('data-word-state="level2"');

    const arLesson: Lesson = {
      ...baseLesson,
      language: 'ar',
    };
    const arHtml = renderToStaticMarkup(
      createElement(ListenAlong, {
        mode: 'tts',
        lesson: arLesson,
        sentences: ['مرحبا بك في المكتبة.'],
        knownWordsMap: new Map<string, WordState>(),
        onWordClick: vi.fn(),
        onExit: vi.fn(),
      }),
    );
    expect(arHtml).toContain('lang="ar"');
    expect(arHtml).toContain('dir="rtl"');
  });

  test('audio mode preserves audio element, scrubber, and clock progress', () => {
    const html = renderToStaticMarkup(
      createElement(ListenAlong, {
        lesson: baseLesson,
        segments: [
          { idx: 0, startMs: 0, endMs: 2000, text: 'Bonjour tout le monde.' },
          { idx: 1, startMs: 2000, endMs: 4000, text: 'Comment ça va ?' },
        ],
        audioUrl: '/api/lessons/lesson-1/audio',
        knownWordsMap: new Map<string, WordState>(),
        onWordClick: vi.fn(),
        onExit: vi.fn(),
      }),
    );

    expect(html).toContain('data-testid="listen-audio"');
    expect(html).toContain('data-testid="listen-scrubber"');
    expect(html).toContain('0:00 / 0:04');
  });
});
