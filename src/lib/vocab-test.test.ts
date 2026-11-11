import { describe, expect, it } from 'vitest';
import {
  CAP_ESTIMATE,
  MAX_ANSWERS,
  MIN_ANSWERS,
  OPTION_COUNT,
  coverageAt,
  estimateFromAnswers,
  levelForEstimate,
  missedWords,
  nextItem,
  recommendBooks,
  seededRng,
  type Answer,
  type VocabTestData,
} from './vocab-test';

/** Bands like the real data: 1,000 wide up to 10,000, then wider up to 40,000; 30 words each. */
function makeData(): VocabTestData {
  const edges = [
    0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 12500, 15000, 20000, 25000,
    30000, 40000,
  ];
  const forms = ['', '的', '地'];
  const bands = edges.slice(1).map((to, b) => {
    const from = edges[b] + 1;
    return {
      from,
      to,
      words: Array.from({ length: 30 }, (_, i) => ({
        w: `w${b}x${i}`,
        // One distinct character per word, so no two meanings share a character.
        zh: `${String.fromCharCode(0x4e00 + b * 30 + i)}${forms[i % 3]}`,
        r: Math.round(from + ((to - from) * (i + 0.5)) / 30),
      })),
    };
  });
  return { bands };
}

const data = makeData();

/** A learner who knows every word ranked up to `size` and says "not sure" otherwise. */
function honest(size: number, count: number, seed = 3): Answer[] {
  const rng = seededRng(seed);
  const answers: Answer[] = [];
  while (answers.length < count) {
    const item = nextItem(answers, data, rng);
    if (!item) break;
    answers.push({ item, choice: item.rank <= size ? item.answer : null });
  }
  return answers;
}

describe('seededRng', () => {
  it('is repeatable and stays in [0, 1)', () => {
    const a = seededRng(1);
    const b = seededRng(1);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(seededRng(1)()).not.toBe(seededRng(2)());
  });
});

describe('nextItem', { timeout: 60_000 }, () => {
  it('builds four different meanings with the right one among them, in the same form', () => {
    const rng = seededRng(9);
    for (let i = 0; i < 40; i++) {
      const item = nextItem([], data, rng)!;
      expect(item.options).toHaveLength(OPTION_COUNT);
      expect(new Set(item.options).size).toBe(OPTION_COUNT);
      expect(item.options[item.answer]).toBe(item.zh);
      const form = (g: string) => (g.endsWith('的') ? 'adj' : g.endsWith('地') ? 'adv' : 'other');
      expect(item.options.every((o) => form(o) === form(item.zh))).toBe(true);
    }
  });

  it('asks every band once first, and never repeats a word', () => {
    const answers = honest(3000, 60);
    expect(new Set(answers.slice(0, 16).map((a) => a.item.band)).size).toBe(16);
    expect(new Set(answers.map((a) => a.item.id)).size).toBe(answers.length);
  });

  it('then asks mostly near the estimate', () => {
    const later = honest(3000, 80).slice(16);
    const near = later.filter((a) => a.item.rank > 700 && a.item.rank < 13000).length;
    expect(near / later.length).toBeGreaterThan(0.7);
  });

  it('stops at the maximum', () => {
    expect(honest(3000, MAX_ANSWERS + 10)).toHaveLength(MAX_ANSWERS);
  });
});

// Each answer refits the learner model, so long simulated runs need more than the default 5 s.
describe('estimateFromAnswers', { timeout: 60_000 }, () => {
  it('waits for the first few answers', () => {
    expect(estimateFromAnswers([], data.bands)).toBeNull();
    expect(estimateFromAnswers(honest(3000, 5), data.bands)).toBeNull();
  });

  it('lands near the true size, inside its range, and narrows with more answers', () => {
    for (const size of [800, 3000, 12000]) {
      const short = estimateFromAnswers(honest(size, MIN_ANSWERS), data.bands)!;
      const long = estimateFromAnswers(honest(size, 100), data.bands)!;
      expect(Math.abs(long.estimate - size) / size).toBeLessThan(0.15);
      expect(long.low).toBeLessThanOrEqual(size);
      expect(long.high).toBeGreaterThanOrEqual(size);
      expect(long.margin).toBeLessThan(short.margin);
    }
  });

  it('gives a low estimate and the guessing tip to someone who only guesses', () => {
    const rng = seededRng(4);
    const answers: Answer[] = [];
    while (answers.length < 60) {
      const item = nextItem(answers, data, rng)!;
      answers.push({ item, choice: Math.floor(rng() * OPTION_COUNT) });
    }
    const result = estimateFromAnswers(answers, data.bands)!;
    expect(result.estimate).toBeLessThan(2000);
    expect(result.guessing).toBe(true);
    expect(estimateFromAnswers(honest(3000, 60), data.bands)!.guessing).toBe(false);
  });

  it('marks very large results as capped', () => {
    expect(estimateFromAnswers(honest(39000, 60), data.bands)!.capped).toBe(true);
    expect(CAP_ESTIMATE).toBeGreaterThan(20000);
  });
});

describe('levelForEstimate', () => {
  it('maps the boundaries', () => {
    expect(levelForEstimate(0)).toBe('A1');
    expect(levelForEstimate(1499)).toBe('A1');
    expect(levelForEstimate(1500)).toBe('A2');
    expect(levelForEstimate(2500)).toBe('B1');
    expect(levelForEstimate(3500)).toBe('B2');
    expect(levelForEstimate(5000)).toBe('C1');
    expect(levelForEstimate(6500)).toBe('C2');
  });
});

describe('coverageAt', () => {
  const cov = [0.8, 0.9, 0.95];
  it('interpolates between points and from zero below 1000', () => {
    expect(coverageAt(cov, 500)).toBeCloseTo(0.4);
    expect(coverageAt(cov, 1000)).toBeCloseTo(0.8);
    expect(coverageAt(cov, 1500)).toBeCloseTo(0.85);
    expect(coverageAt(cov, 2000)).toBeCloseTo(0.9);
  });
  it('clamps at the ends', () => {
    expect(coverageAt(cov, 0)).toBe(0);
    expect(coverageAt(cov, 9000)).toBe(0.95);
  });
  it('returns null when the data is missing or malformed', () => {
    expect(coverageAt(undefined, 1000)).toBeNull();
    expect(coverageAt(null, 1000)).toBeNull();
    expect(coverageAt([], 1000)).toBeNull();
    expect(coverageAt([0.5, null], 1000)).toBeNull();
  });
});

describe('recommendBooks', () => {
  const flat = (v: number) => Array(14).fill(v);
  const books = [
    { slug: 'b2-easy', level: 'B2', cov: flat(0.99) },
    { slug: 'b2-hard', level: 'B2', cov: flat(0.96) },
    { slug: 'b1-ok', level: 'B1', cov: flat(0.97) },
    { slug: 'b2-too-hard', level: 'B2', cov: flat(0.9) },
    { slug: 'c1-ok', level: 'C1', cov: flat(0.99) },
    { slug: 'a1-ok', level: 'A1', cov: flat(0.99) },
    { slug: 'b2-nocov', level: 'B2' },
    { slug: 'odd-level', level: 'X9', cov: flat(0.99) },
  ];

  it('ignores a book with an unknown level', () => {
    const picked = recommendBooks(books, 4000, 'A1', 6);
    expect(picked.map((b) => b.slug)).not.toContain('odd-level');
  });

  it('keeps readable books at the level or one below, closest level first, hardest first', () => {
    const picked = recommendBooks(books, 4000, 'B2', 3);
    expect(picked.map((b) => b.slug)).toEqual(['b2-hard', 'b2-easy', 'b1-ok']);
    expect(picked[0].coverage).toBeCloseTo(0.96);
  });

  it('fills up with books near the level when too few qualify', () => {
    const picked = recommendBooks(books, 4000, 'B2', 6);
    expect(picked).toHaveLength(6);
    expect(picked.slice(0, 3).map((b) => b.slug)).toEqual(['b2-hard', 'b2-easy', 'b1-ok']);
    expect(new Set(picked.map((b) => b.slug)).size).toBe(6);
    expect(picked.find((b) => b.slug === 'b2-nocov')?.coverage).toBeNull();
  });

  it('works when no book has coverage', () => {
    const picked = recommendBooks(
      [
        { slug: 'x', level: 'B1' },
        { slug: 'y', level: 'B2' },
      ],
      4000,
      'B2',
      6,
    );
    expect(picked.map((b) => b.slug)).toEqual(['y', 'x']);
    expect(picked.every((b) => b.coverage === null)).toBe(true);
  });
});

describe('missedWords', { timeout: 60_000 }, () => {
  it('lists words answered wrong or "not sure" up to the estimate plus 1000, easiest first', () => {
    const answers = honest(3000, 60);
    const missed = missedWords(answers, 3000, data.bands);
    expect(missed.length).toBeGreaterThan(0);
    expect(missed.length).toBeLessThanOrEqual(8);
    expect(missed.every((i) => i.rank > 3000 && data.bands[i.band].to <= 4000)).toBe(true);
    expect(missed.map((i) => i.band)).toEqual([...missed.map((i) => i.band)].sort((a, b) => a - b));
    expect(missedWords(honest(40000, 40), 40000, data.bands)).toEqual([]);
  });
});
