import { describe, expect, it } from 'vitest';
import {
  coverageAt,
  levelForEstimate,
  missedWords,
  recommendBooks,
  sampleTest,
  scoreTest,
  seededRng,
  type TestItem,
  type VocabTestData,
} from './vocab-test';

function makeData(): VocabTestData {
  const sizes = [...Array(10).fill(1000), 4000];
  let from = 1;
  const bands = sizes.map((size, b) => {
    const band = {
      from,
      to: from + size - 1,
      words: Array.from({ length: 30 }, (_, i) => ({ w: `w${b}_${i}`, zh: `z${b}_${i}` })),
    };
    from += size;
    return band;
  });
  return { bands, pseudowords: Array.from({ length: 120 }, (_, i) => `fake${i}`) };
}

const data = makeData();
const items = sampleTest(data, seededRng(7));
const ids = (list: TestItem[]) => new Set(list.map((i) => i.id));

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

describe('sampleTest', () => {
  it('picks 45 real and 20 made-up words with unique ids', () => {
    expect(items).toHaveLength(65);
    expect(items.filter((i) => i.kind === 'real')).toHaveLength(45);
    expect(items.filter((i) => i.kind === 'fake')).toHaveLength(20);
    expect(new Set(items.map((i) => i.id)).size).toBe(65);
    for (let b = 0; b < 10; b++) {
      expect(items.filter((i) => i.band === b)).toHaveLength(4);
    }
    expect(items.filter((i) => i.band === 10)).toHaveLength(5);
  });

  it('differs between seeds and keeps the gloss on real words', () => {
    const other = sampleTest(data, seededRng(8));
    expect(other.map((i) => i.id)).not.toEqual(items.map((i) => i.id));
    expect(items.find((i) => i.kind === 'real')?.zh).toMatch(/^z/);
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

describe('scoreTest', () => {
  it('gives zero and A1 when nothing is ticked', () => {
    const score = scoreTest(items, new Set(), data.bands);
    expect(score).toMatchObject({ estimate: 0, low: 0, high: 0, level: 'A1', unreliable: false });
  });

  it('gives about 14000 and C2 when every real word is ticked', () => {
    const score = scoreTest(items, ids(items.filter((i) => i.kind === 'real')), data.bands);
    expect(score.estimate).toBe(14000);
    expect(score.level).toBe('C2');
    expect(score.high).toBe(16100);
    expect(score.falseAlarmRate).toBe(0);
  });

  it('lowers the estimate and flags unreliable when made-up words are ticked', () => {
    const real = items.filter((i) => i.kind === 'real');
    const fakes = items.filter((i) => i.kind === 'fake');
    const half = real.filter((_, i) => i % 2 === 0);
    const clean = scoreTest(items, ids(half), data.bands);
    const some = scoreTest(items, ids([...half, ...fakes.slice(0, 2)]), data.bands);
    expect(some.estimate).toBeLessThan(clean.estimate);
    expect(some.unreliable).toBe(false);
    const many = scoreTest(items, ids([...half, ...fakes.slice(0, 8)]), data.bands);
    expect(many.falseAlarmRate).toBe(0.4);
    expect(many.unreliable).toBe(true);
  });

  it('gives zero when every made-up word is ticked', () => {
    const score = scoreTest(items, ids(items), data.bands);
    expect(score.estimate).toBe(0);
    expect(score.unreliable).toBe(true);
  });

  it('counts only the bands that were hit', () => {
    const first = items.filter((i) => i.kind === 'real' && i.band === 0);
    expect(scoreTest(items, ids(first), data.bands).estimate).toBe(1000);
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

describe('missedWords', () => {
  it('lists unknown real words within the estimate plus 1000, easiest first, capped', () => {
    const real = items.filter((i) => i.kind === 'real');
    const missed = missedWords(items, new Set(), 3000, data.bands);
    expect(missed.length).toBeLessThanOrEqual(8);
    expect(missed.every((i) => i.kind === 'real' && data.bands[i.band].to <= 4000)).toBe(true);
    expect(missed.map((i) => i.band)).toEqual([...missed.map((i) => i.band)].sort((a, b) => a - b));
    const known = missedWords(items, ids(real), 14000, data.bands);
    expect(known).toEqual([]);
  });
  it('skips made-up words', () => {
    expect(
      missedWords(items, new Set(), 14000, data.bands, 100).every((i) => i.kind === 'real'),
    ).toBe(true);
  });
});
