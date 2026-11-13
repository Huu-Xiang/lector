import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadVocabTestData } from './vocab-test-data';
import {
  CAP_ESTIMATE,
  MAX_ANSWERS,
  MIN_ANSWERS,
  NONE_OF_ABOVE,
  OPTION_COUNT,
  coverageAt,
  estimateFromAnswers,
  levelForEstimate,
  missedWords,
  nextItem,
  nextTarget,
  optionWidth,
  prepareNext,
  recommendBooks,
  seededRng,
  type Answer,
  type SenseRow,
  type TestItem,
  type VocabTestData,
} from './vocab-test';

const POS = ['n.', 'v.', 'adj.'];

// Bands like the real data, 30 words each, one distinct meaning character per word. Each English
// line names the next word in the band, so the "no tested word in English" rule has work to do.
function makeData(): VocabTestData {
  const edges = [
    0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 12500, 15000, 20000, 25000,
    30000, 40000,
  ];
  const bands = edges.slice(1).map((to, b) => {
    const from = edges[b] + 1;
    return {
      from,
      to,
      words: Array.from({ length: 30 }, (_, i) => ({
        w: `w${b}x${i}`,
        r: Math.round(from + ((to - from) * (i + 0.5)) / 30),
        s: [
          {
            p: POS[i % 3],
            zh: [String.fromCharCode(0x4e00 + b * 30 + i)],
            en: `close to w${b}x${(i + 1) % 30}`,
          },
        ],
      })),
    };
  });
  return { bands };
}

const data = makeData();

function realData(): VocabTestData {
  const file = path.join(process.cwd(), 'languages', 'en', 'content', 'vocab-test.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')) as VocabTestData;
}

/** A learner who knows every word ranked up to `size` and says "not sure" otherwise. */
function honest(
  size: number,
  count: number,
  seed = 3,
  source = data,
  seen: ReadonlySet<string> = new Set(),
): Answer[] {
  const answers: Answer[] = [];
  while (answers.length < count) {
    const item = nextItem(answers, source, seed, seen);
    if (!item) break;
    answers.push({ item, choice: item.rank <= size ? item.answer : null });
  }
  return answers;
}

function sameRows(a: readonly SenseRow[], b: readonly SenseRow[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Collect the first item of many seeds, so option rules are checked across many words. */
function firstItems(count: number, answers: Answer[] = []): TestItem[] {
  return Array.from({ length: count }, (_, seed) => nextItem(answers, data, seed + 1)!);
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

describe('item options', { timeout: 60_000 }, () => {
  // Items deep in the test come from every band, not only the easy one.
  const items = [
    ...firstItems(300),
    ...Array.from({ length: 40 }, (_, seed) =>
      honest(8000, 40, seed + 1).map((a) => a.item),
    ).flat(),
  ];

  it('has three different meanings plus "none of the above", with a valid answer', () => {
    for (const item of items) {
      expect(item.meanings).toHaveLength(OPTION_COUNT - 1);
      expect(new Set(item.meanings.map((m) => JSON.stringify(m))).size).toBe(OPTION_COUNT - 1);
      if (item.answer === NONE_OF_ABOVE) {
        expect(item.meanings.some((m) => sameRows(m, item.senses))).toBe(false);
      } else {
        expect(sameRows(item.meanings[item.answer], item.senses)).toBe(true);
      }
    }
  });

  it('makes "none of the above" right about one time in four', () => {
    const share = items.filter((item) => item.answer === NONE_OF_ABOVE).length / items.length;
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.3);
  });

  it('gives wrong options the same part of speech, a similar width and no tell-tale English', () => {
    for (const item of items) {
      for (const meaning of item.meanings) {
        if (sameRows(meaning, item.senses)) continue;
        expect(meaning.map((row) => row.p)).toEqual(item.senses.map((row) => row.p));
        const ratio = optionWidth(meaning) / optionWidth(item.senses);
        expect(ratio).toBeGreaterThanOrEqual(0.6);
        expect(ratio).toBeLessThanOrEqual(1.4);
        expect(meaning.some((row) => row.en.split(' ').includes(item.word))).toBe(false);
      }
    }
  });
});

describe('question order', { timeout: 60_000 }, () => {
  it('does not offer a meaning already shown for an earlier word as a wrong option', () => {
    const answers = honest(3000, 60);
    answers.forEach(({ item }, i) => {
      const shown = new Set(answers.slice(0, i).map((a) => JSON.stringify(a.item.senses)));
      for (const meaning of item.meanings) {
        if (!sameRows(meaning, item.senses)) expect(shown.has(JSON.stringify(meaning))).toBe(false);
      }
    });
  });

  it('starts with three mid-frequency words and never repeats a word', () => {
    const answers = honest(3000, 60);
    expect(answers.slice(0, 3).every(({ item }) => item.rank >= 2001 && item.rank <= 5000)).toBe(
      true,
    );
    expect(new Set(answers.map((a) => a.item.id)).size).toBe(answers.length);
  });

  it('samples different nearby words for the same answers with different seeds', () => {
    const answers = honest(3000, 4);
    const target = nextTarget(answers, data, seededRng(5));
    const picks = Array.from({ length: 20 }, (_, seed) => nextItem(answers, data, seed)!);
    expect(new Set(picks.map(({ word }) => word)).size).toBeGreaterThan(1);
    expect(picks.every(({ rank }) => Math.abs(Math.log(rank) - target) < 0.15)).toBe(true);
  });

  it('Covers AE4: a learner who knows the top 2,000 words gets later words near rank 2,000', () => {
    const later = honest(2000, 60).slice(16);
    const ranks = later.map((a) => a.item.rank).sort((a, b) => a - b);
    const median = ranks[Math.floor(ranks.length / 2)];
    expect(median).toBeGreaterThan(1000);
    expect(median).toBeLessThan(4000);
  });

  it('asks a 3,000-word learner mostly about words between ranks 700 and 13,000', () => {
    const later = honest(3000, 80).slice(16);
    const near = later.filter((a) => a.item.rank > 700 && a.item.rank < 13000).length;
    expect(near / later.length).toBeGreaterThan(0.7);
  });

  it('takes a learner who knows everything past band 10 within 25 words', () => {
    const bands = honest(40000, 25).map((a) => a.item.band);
    expect(Math.max(...bands)).toBeGreaterThanOrEqual(10);
  });

  it('moves the target up after a right answer and down after "not sure", in every stage', () => {
    for (const count of [6, 30]) {
      const before = honest(3000, count);
      const item = nextItem(before, data, 3)!;
      const up = nextTarget([...before, { item, choice: item.answer }], data, seededRng(5));
      const down = nextTarget([...before, { item, choice: null }], data, seededRng(5));
      expect(up).toBeGreaterThan(down);
    }
  });

  it('prepares the next word for both outcomes, matching what the test then asks', () => {
    const before = honest(3000, 30);
    const item = nextItem(before, data, 3)!;
    const prepared = prepareNext(before, item, data, 3);
    expect(prepared.right).toEqual(nextItem([...before, { item, choice: item.answer }], data, 3));
    expect(prepared.notRight).toEqual(nextItem([...before, { item, choice: null }], data, 3));
  });

  it('prefers a word not asked in an earlier test when one is near the target', () => {
    const before = honest(3000, 30);
    const item = nextItem(before, data, 3)!;
    const other = nextItem(before, data, 3, new Set([item.word]))!;
    expect(other.word).not.toBe(item.word);
    expect(Math.abs(Math.log(other.rank / item.rank))).toBeLessThan(0.5);
  });

  it('keeps earlier-test words out of the wrong options while others fit', () => {
    const seen = new Set(data.bands[0].words.slice(0, 10).map((word) => word.w));
    const seenRows = new Set(
      data.bands[0].words.slice(0, 10).map((word) => JSON.stringify(word.s)),
    );
    for (let seed = 1; seed <= 100; seed++) {
      const item = nextItem([], data, seed, seen)!;
      expect(seen.has(item.word)).toBe(false);
      for (const meaning of item.meanings)
        expect(seenRows.has(JSON.stringify(meaning))).toBe(false);
    }
  });

  it('prepares the next word with the earlier-test words too', () => {
    const seen = new Set(honest(3000, 40, 9).map((a) => a.item.word));
    const before = honest(3000, 20, 3, data, seen);
    const item = nextItem(before, data, 3, seen)!;
    const prepared = prepareNext(before, item, data, 3, seen);
    expect(prepared.right).toEqual(
      nextItem([...before, { item, choice: item.answer }], data, 3, seen),
    );
    expect(prepared.notRight).toEqual(nextItem([...before, { item, choice: null }], data, 3, seen));
  });

  it('stops at the maximum', () => {
    expect(honest(3000, MAX_ANSWERS + 10)).toHaveLength(MAX_ANSWERS);
  });
});

describe('the real test data', { timeout: 120_000 }, () => {
  const real = realData();

  it('has 16 bands of 375 words with one or two meaning rows each', () => {
    expect(real.version).toBe(3);
    expect(real.bands).toHaveLength(16);
    for (const band of real.bands) {
      expect(band.words).toHaveLength(375);
      for (const word of band.words) {
        expect(word.s.length).toBeGreaterThanOrEqual(1);
        expect(word.s.length).toBeLessThanOrEqual(2);
      }
    }
  });

  it('gives every item three wrong-or-right meanings that follow the option rules', () => {
    for (const size of [500, 2000, 5000, 12000, 30000]) {
      for (let seed = 1; seed <= 6; seed++) {
        for (const { item } of honest(size, MAX_ANSWERS, seed, real)) {
          expect(new Set(item.meanings.map((m) => JSON.stringify(m))).size).toBe(3);
          for (const meaning of item.meanings) {
            if (sameRows(meaning, item.senses)) continue;
            expect(meaning.map((row) => row.p)).toEqual(item.senses.map((row) => row.p));
            const ratio = optionWidth(meaning) / optionWidth(item.senses);
            expect(ratio).toBeGreaterThanOrEqual(0.6);
            expect(ratio).toBeLessThanOrEqual(1.4);
          }
        }
      }
    }
  });

  it('asks no word twice over five tests of 60 answers on one device', () => {
    for (const size of [1000, 3000, 8000, 20000]) {
      const seen = new Set<string>();
      for (let test = 1; test <= 5; test++) {
        for (const { item } of honest(size, 60, test * 7, real, seen)) {
          expect(seen.has(item.word)).toBe(false);
          seen.add(item.word);
        }
      }
    }
  });
});

// Each answer refits the learner model, so long simulated runs need more than the default 5 s.
describe('estimateFromAnswers', { timeout: 60_000 }, () => {
  it('can estimate after the first answer', () => {
    expect(estimateFromAnswers([], data.bands)).toBeNull();
    expect(estimateFromAnswers(honest(3000, 1), data.bands)?.answered).toBe(1);
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
      const item = nextItem(answers, data, 4)!;
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

describe('Russian answers for the English test', () => {
  it('uses English lemmas from the original bank and draws complete Russian options', () => {
    const english = loadVocabTestData()!;
    const russian = loadVocabTestData('ru')!;
    expect(russian?.answerLanguage).toBe('ru');
    expect(russian.bands.map(({ from, to }) => [from, to])).toEqual(
      english.bands.map(({ from, to }) => [from, to]),
    );
    russian.bands.forEach((band, index) => {
      const original = new Map(english.bands[index].words.map((word) => [word.w, word.r]));
      expect(band.words.map(({ w }) => w)).toEqual([...original.keys()]);
      for (const word of band.words) {
        expect(word.r).toBe(original.get(word.w));
        expect(word.s.every((sense) => sense.ru?.some((gloss) => /[а-яё]/i.test(gloss)))).toBe(
          true,
        );
      }
    });

    for (const seed of [1, 45, 190]) {
      const answers: Answer[] = [];
      for (let i = 0; i < 24; i++) {
        const item = nextItem(answers, russian, seed)!;
        expect(item.word).toMatch(/^[a-z]+$/i);
        expect(item.meanings).toHaveLength(3);
        const labels = item.meanings.map((option) =>
          option.flatMap((sense) => sense.ru).join('; '),
        );
        expect(labels.every((label) => /[а-яё]/i.test(label))).toBe(true);
        expect(new Set(labels).size).toBe(3);
        answers.push({ item, choice: item.answer });
      }
    }
  });
});
