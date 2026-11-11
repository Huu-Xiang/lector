import { describe, expect, it } from 'vitest';
import { LANGUAGES } from './languages';
import type { WordState } from '@/types';
import {
  PREFETCH_MAX_CANDIDATES,
  PREFETCH_TEXT_CHARS,
  pickPrefetchCandidates,
} from './prefetch-words';

const fr = LANGUAGES.fr;

describe('pickPrefetchCandidates', () => {
  it('skips known and ignored words, short words and repeats', () => {
    const states = new Map<string, WordState>([
      ['chat', 'known'],
      ['maison', 'ignored'],
      ['jardin', 'level2'],
    ]);
    const words = pickPrefetchCandidates(
      'Le chat, la maison, le jardin. Le jardin et la porte.',
      fr,
      states,
    );
    expect(words).toEqual(['jardin', 'porte']);
  });

  it('keeps reading order and stops at the limit', () => {
    const text = Array.from(
      { length: 80 },
      (_, i) => `mot${String.fromCharCode(97 + (i % 26))}x${'y'.repeat(i)}`,
    ).join(' ');
    const words = pickPrefetchCandidates(text, fr, new Map(), 5);
    expect(words).toHaveLength(5);
    expect(PREFETCH_MAX_CANDIDATES).toBeGreaterThan(5);
  });

  it('ignores text past the first part of the lesson', () => {
    const text = `${'a '.repeat(PREFETCH_TEXT_CHARS)} lointain`;
    expect(pickPrefetchCandidates(text, fr, new Map())).toEqual([]);
  });

  it('offers nothing for unspaced scripts', () => {
    expect(pickPrefetchCandidates('我喜欢读书', LANGUAGES.zh, new Map())).toEqual([]);
  });
});
