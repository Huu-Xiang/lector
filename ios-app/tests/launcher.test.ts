import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const { pickLocale, nextStep } = createRequire(import.meta.url)('../launcher/logic.js') as {
  pickLocale: (stored: string | null, device: string) => string;
  nextStep: (health: { ok: boolean } | null, cached: number) => string;
};

describe('nextStep', () => {
  it('opens the site when the health check passes', () => {
    expect(nextStep({ ok: true }, 0)).toBe('open');
    expect(nextStep({ ok: true }, 3)).toBe('open');
  });

  it('shows the error screen when the check fails and nothing is cached', () => {
    expect(nextStep({ ok: false }, 0)).toBe('error');
    expect(nextStep(null, 0)).toBe('error');
  });

  it('shows the offline list when the check fails and lessons are cached', () => {
    expect(nextStep({ ok: false }, 2)).toBe('offline');
  });
});

describe('pickLocale', () => {
  it('uses the stored interface locale when it is supported', () => {
    expect(pickLocale('zh-TW', 'en-US')).toBe('zh-TW');
  });

  it('falls back to the device language when nothing is stored', () => {
    expect(pickLocale(null, 'zh-Hant-TW')).toBe('zh-TW');
    expect(pickLocale(null, 'zh-HK')).toBe('zh-TW');
    expect(pickLocale(null, 'zh-CN')).toBe('zh-CN');
    expect(pickLocale(null, 'fr-FR')).toBe('en');
  });

  it('ignores a stored value the app does not offer', () => {
    expect(pickLocale('ja', 'zh-CN')).toBe('zh-CN');
  });
});

const logic = createRequire(import.meta.url)('../launcher/logic.js') as {
  parseState: (raw: string) => { version: number; lessons: unknown[]; queue: unknown[] };
  splitParagraphs: (text: string) => string[];
  sentenceAround: (paragraph: string, index: number) => string;
  newQueuedWord: (input: Record<string, string>) => Record<string, string>;
};

describe('offline reader rules', () => {
  it('splits lesson text into paragraphs', () => {
    expect(logic.splitParagraphs('One.\n\nTwo.\n  \nThree.')).toEqual(['One.', 'Two.', 'Three.']);
  });

  it('finds the sentence around a word', () => {
    const p = 'He sent me to College. I resided three years. Then I left.';
    expect(logic.sentenceAround(p, p.indexOf('resided'))).toBe('I resided three years.');
    expect(logic.sentenceAround(p, 0)).toBe('He sent me to College.');
  });

  it('reads the saved file and survives a broken one', () => {
    expect(logic.parseState('nope')).toEqual({ version: 1, lessons: [], queue: [] });
    expect(logic.parseState('{"version":1,"lessons":[{"id":"a"}]}').lessons).toHaveLength(1);
  });

  it('builds a queued word with the same fields as the web app writes', async () => {
    const { enqueueWord, emptyOfflineState } = await import('../../src/lib/offline/store');
    const input = {
      userId: 'u1',
      vocabId: 'v1',
      text: 'estate',
      sentence: 'A small estate.',
      language: 'en',
      lessonId: 'l1',
      now: '2026-11-05T10:00:00.000Z',
    };
    const fromWeb = enqueueWord(emptyOfflineState(), {
      userId: 'u1',
      vocabId: 'v1',
      text: 'estate',
      type: 'word',
      sentence: 'A small estate.',
      language: 'en',
      lessonId: 'l1',
      createdAt: input.now,
    }).queue[0];
    expect(logic.newQueuedWord(input)).toEqual(fromWeb);
  });
});
