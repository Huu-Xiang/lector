import { afterEach, describe, expect, test } from 'bun:test';
import {
  DEFAULT_RANK_FLOOR,
  PREFETCH_MAX_WORDS,
  prefetchEnabled,
  rankFloorForLevel,
  selectPrefetchWords,
} from './localize-prefetch';

describe('rankFloorForLevel', () => {
  test('maps a CEFR level to the rank where its band ends', () => {
    expect(rankFloorForLevel('A1')).toBe(500);
    expect(rankFloorForLevel('b2')).toBe(5000);
  });

  test('falls back to the default for a missing or unknown level', () => {
    expect(rankFloorForLevel(null)).toBe(DEFAULT_RANK_FLOOR);
    expect(rankFloorForLevel('Z9')).toBe(DEFAULT_RANK_FLOOR);
  });
});

describe('selectPrefetchWords', () => {
  test('drops words inside the learner band and keeps unranked words', () => {
    const picked = selectPrefetchWords(
      [{ word: 'the', rank: 3 }, { word: 'ubiquitous', rank: 9000 }, { word: 'quokka' }],
      1500,
    );
    expect(picked).toEqual(['ubiquitous', 'quokka']);
  });

  test('keeps reading order and stops at the limit', () => {
    const candidates = Array.from({ length: 30 }, (_, i) => ({ word: `w${i}`, rank: 5000 + i }));
    const picked = selectPrefetchWords(candidates, 1000);
    expect(picked).toHaveLength(PREFETCH_MAX_WORDS);
    expect(picked[0]).toBe('w0');
    expect(selectPrefetchWords(candidates, 1000, 3)).toEqual(['w0', 'w1', 'w2']);
  });
});

describe('prefetchEnabled', () => {
  const saved = process.env.LOOKUP_PREFETCH;
  afterEach(() => {
    if (saved === undefined) delete process.env.LOOKUP_PREFETCH;
    else process.env.LOOKUP_PREFETCH = saved;
  });

  test('is on unless LOOKUP_PREFETCH is 0', () => {
    delete process.env.LOOKUP_PREFETCH;
    expect(prefetchEnabled()).toBe(true);
    process.env.LOOKUP_PREFETCH = '0';
    expect(prefetchEnabled()).toBe(false);
  });
});
