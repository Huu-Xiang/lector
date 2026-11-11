import { beforeEach, describe, expect, it } from 'vitest';
import { VOCAB_RESULT_KEY, readVocabResult, writeVocabResult } from './vocab-result';

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

describe('vocab result storage', () => {
  it('round-trips a fresh result', () => {
    writeVocabResult(4800, 'B2', 1000);
    expect(readVocabResult(2000)).toEqual({ estimate: 4800, level: 'B2', takenAt: 1000 });
  });
  it('ignores a result older than 30 days', () => {
    writeVocabResult(4800, 'B2', 0);
    expect(readVocabResult(31 * 24 * 60 * 60 * 1000)).toBeNull();
  });
  it('ignores malformed values', () => {
    store.set(VOCAB_RESULT_KEY, '{"estimate":"x","level":"B2","takenAt":1}');
    expect(readVocabResult(2)).toBeNull();
    store.set(VOCAB_RESULT_KEY, '{"estimate":100,"level":"Z9","takenAt":1}');
    expect(readVocabResult(2)).toBeNull();
    store.set(VOCAB_RESULT_KEY, 'not json');
    expect(readVocabResult(2)).toBeNull();
  });
});
