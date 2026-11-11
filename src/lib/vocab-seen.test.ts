import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_SEEN, VOCAB_SEEN_KEY, addSeenWord, readSeenWords } from './vocab-seen';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  });
});

describe('seen test words', () => {
  it('starts empty and keeps words in order without duplicates', () => {
    expect(readSeenWords()).toEqual([]);
    addSeenWord('bank');
    addSeenWord('river');
    addSeenWord('bank');
    expect(readSeenWords()).toEqual(['river', 'bank']);
  });

  it('drops the oldest words past the cap', () => {
    localStorage.setItem(
      VOCAB_SEEN_KEY,
      JSON.stringify(Array.from({ length: MAX_SEEN }, (_, i) => `w${i}`)),
    );
    addSeenWord('new');
    const words = readSeenWords();
    expect(words).toHaveLength(MAX_SEEN);
    expect(words[0]).toBe('w1');
    expect(words.at(-1)).toBe('new');
  });

  it('ignores malformed storage', () => {
    localStorage.setItem(VOCAB_SEEN_KEY, '{"a":1}');
    expect(readSeenWords()).toEqual([]);
    localStorage.setItem(VOCAB_SEEN_KEY, 'not json');
    expect(readSeenWords()).toEqual([]);
  });
});
