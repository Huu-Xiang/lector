import { pickNearLevel } from './recommend';
import type { CefrLevel } from './reading-level';

export interface VocabBand {
  from: number;
  to: number;
  /** `r` is the word's frequency rank among English lemmas. */
  words: Array<{ w: string; zh: string; r: number }>;
}

export interface VocabTestData {
  version?: number;
  bands: VocabBand[];
  source?: string;
}

/** One question: an English word and four Chinese meanings, one of them right. */
export interface TestItem {
  id: string;
  word: string;
  /** Index into `bands`. */
  band: number;
  rank: number;
  /** The right meaning. */
  zh: string;
  options: string[];
  answer: number;
}

export interface Answer {
  item: TestItem;
  /** Index of the chosen option, or null for "not sure". */
  choice: number | null;
}

export type Rng = () => number;

export const OPTION_COUNT = 4;
/** The result can be shown after this many answers; the test stops at the maximum. */
export const MIN_ANSWERS = 20;
export const MAX_ANSWERS = 120;
/** z for a 90% interval: the shown range is estimate ± margin. */
const Z90 = 1.645;
/** A fitted guess rate this high means the learner guesses where "not sure" would be truer. */
const GUESSING_LEVEL = 0.75;
export const READABLE_COVERAGE = 0.95;
/** Above this the test runs out of hard words, so the number reads as "at least". */
export const CAP_ESTIMATE = 30000;

/** mulberry32: a small seeded generator that returns values in [0, 1). */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(list: readonly T[], rng: Rng): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 的 marks an adjective and 地 an adverb in a gloss; a mismatched option gives the answer away. */
function glossForm(gloss: string): 'adj' | 'adv' | 'other' {
  if (gloss.endsWith('的')) return 'adj';
  if (gloss.endsWith('地')) return 'adv';
  return 'other';
}

/** Characters too common in glosses to make two meanings look alike. */
const FILLER = new Set('的地得使之者人性化物一.…');

function sharesMeaning(a: string, b: string): boolean {
  const chars = new Set([...a].filter((c) => !FILLER.has(c)));
  return [...b].some((c) => chars.has(c));
}

/**
 * Three wrong meanings for a word: same form (的 / 地 / other) and no shared characters,
 * from its own band first and then from the nearest bands.
 */
function distractors(data: VocabTestData, band: number, word: string, gloss: string, rng: Rng) {
  const order = data.bands
    .map((_, index) => index)
    .sort((a, b) => Math.abs(a - band) - Math.abs(b - band) || a - b);
  const picked: string[] = [];
  for (const strict of [true, false]) {
    for (const index of order) {
      const pool = shuffle(
        data.bands[index].words.filter(
          (entry) =>
            entry.w !== word &&
            entry.zh !== gloss &&
            !picked.includes(entry.zh) &&
            !sharesMeaning(gloss, entry.zh) &&
            !picked.some((other) => sharesMeaning(other, entry.zh)) &&
            (!strict || glossForm(entry.zh) === glossForm(gloss)),
        ),
        rng,
      );
      for (const entry of pool) {
        if (picked.length === OPTION_COUNT - 1) return picked;
        picked.push(entry.zh);
      }
    }
  }
  return picked;
}

function makeItem(data: VocabTestData, band: number, index: number, rng: Rng): TestItem {
  const entry = data.bands[band].words[index];
  const options = shuffle([entry.zh, ...distractors(data, band, entry.w, entry.zh, rng)], rng);
  return {
    id: `r${band}:${entry.w}`,
    word: entry.w,
    band,
    rank: entry.r,
    zh: entry.zh,
    options,
    answer: options.indexOf(entry.zh),
  };
}

/** Shown before this many answers is not an estimate yet. */
export const FIRST_ESTIMATE_AFTER = 8;

/**
 * The next question, or null when the test is over. The first round asks each band once in a
 * random order; after that, words near the current estimate tell the most.
 */
export function nextItem(
  answers: readonly Answer[],
  data: VocabTestData,
  rng: Rng,
): TestItem | null {
  if (answers.length >= MAX_ANSWERS) return null;
  const asked = new Set(answers.map((answer) => answer.item.id));
  const fresh = data.bands.map((band, index) =>
    band.words.map((_, i) => i).filter((i) => !asked.has(`r${index}:${band.words[i].w}`)),
  );
  const seen = new Set(answers.map((answer) => answer.item.band));
  const unseen = data.bands.map((_, index) => index).filter((i) => !seen.has(i) && fresh[i].length);
  if (unseen.length > 0) {
    const band = unseen[Math.floor(rng() * unseen.length)];
    return makeItem(data, band, fresh[band][Math.floor(rng() * fresh[band].length)], rng);
  }
  const fit = fitAnswers(answers, data.bands);
  // A log-normal spread around the estimate: mostly near it, sometimes well above or below.
  const z = Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const target = Math.log(Math.max(fit.knee, 300)) + 0.6 * z;
  let best: { band: number; index: number; distance: number } | null = null;
  data.bands.forEach((band, b) => {
    for (const i of fresh[b]) {
      const distance = Math.abs(Math.log(band.words[i].r) - target);
      if (!best || distance < best.distance) best = { band: b, index: i, distance };
    }
  });
  if (!best) return null;
  const pick = best as { band: number; index: number };
  return makeItem(data, pick.band, pick.index, rng);
}

/*
 * The learner model: a word of rank r is known with probability 1 / (1 + e^((ln r - ln K) / w)).
 * Word knowledge follows the log of frequency, so the fade is even on a log scale of rank. An
 * unknown word is answered by a guess with probability g (right one time in four) and "not sure"
 * otherwise. The estimate is the number of words up to the last band that the fit says are known.
 */
const KNEES = Array.from({ length: 108 }, (_, i) => Math.round(40 * Math.pow(1.068, i)));
const WIDTHS = [0.15, 0.25, 0.4, 0.6, 0.85];
const GUESS = [0.02, 0.15, 0.35, 0.55, 0.75, 0.95];
/** The log-likelihood drop that bounds the range; 2.0 kept 90% coverage in simulation. */
const DROP_90 = 2.0;

function knownShare(rank: number, knee: number, width: number): number {
  return 1 / (1 + Math.exp((Math.log(rank) - Math.log(knee)) / width));
}

/** Expected known words with rank <= maxRank, summed over 400 log-spaced steps. */
function knownWords(knee: number, width: number, maxRank: number): number {
  const steps = 400;
  const ratio = Math.pow(maxRank, 1 / steps);
  let total = 0;
  let lower = 1;
  for (let i = 1; i <= steps; i++) {
    const upper = Math.pow(ratio, i);
    total += (upper - lower) * knownShare(Math.sqrt(lower * upper), knee, width);
    lower = upper;
  }
  return total;
}

const totals = new Map<string, number>();

function totalFor(knee: number, width: number, maxRank: number): number {
  const key = `${knee}:${width}:${maxRank}`;
  let total = totals.get(key);
  if (total === undefined) {
    total = knownWords(knee, width, maxRank);
    totals.set(key, total);
  }
  return total;
}

interface Fit {
  knee: number;
  estimate: number;
  low: number;
  high: number;
  guess: number;
}

export function fitAnswers(
  answers: readonly Answer[],
  bands: ReadonlyArray<Pick<VocabBand, 'from' | 'to'>>,
): Fit {
  const maxRank = bands.length ? bands[bands.length - 1].to : 0;
  const outcomes = answers.map(({ item, choice }) => ({
    rank: item.rank,
    kind: choice === item.answer ? 0 : choice === null ? 2 : 1,
  }));
  const points: Array<{ ll: number; knee: number; width: number; guess: number }> = [];
  for (const knee of KNEES) {
    for (const width of WIDTHS) {
      const known = outcomes.map((o) => knownShare(o.rank, knee, width));
      for (const guess of GUESS) {
        let ll = 0;
        outcomes.forEach((o, i) => {
          const k = known[i];
          const p =
            o.kind === 0
              ? k + ((1 - k) * guess) / OPTION_COUNT
              : o.kind === 1
                ? ((1 - k) * guess * (OPTION_COUNT - 1)) / OPTION_COUNT
                : (1 - k) * (1 - guess);
          ll += Math.log(Math.max(p, 1e-9));
        });
        points.push({ ll, knee, width, guess });
      }
    }
  }
  const top = points.reduce((a, b) => (b.ll > a.ll ? b : a));
  const inside = points.filter((point) => point.ll >= top.ll - DROP_90);
  const totals = inside.map((point) => totalFor(point.knee, point.width, maxRank));
  return {
    knee: top.knee,
    estimate: totalFor(top.knee, top.width, maxRank),
    low: Math.min(...totals),
    high: Math.max(...totals),
    guess: top.guess,
  };
}

export type Precision = 'low' | 'medium' | 'high';

export interface LiveEstimate {
  estimate: number;
  /** Half-width of the 90% range, in words. */
  margin: number;
  low: number;
  high: number;
  level: CefrLevel;
  precision: Precision;
  answered: number;
  capped: boolean;
  /** Many wrong picks: the learner is guessing where "not sure" would be more accurate. */
  guessing: boolean;
}

/** The estimate so far, or null before the first few answers. */
export function estimateFromAnswers(
  answers: readonly Answer[],
  bands: ReadonlyArray<Pick<VocabBand, 'from' | 'to'>>,
): LiveEstimate | null {
  if (answers.length < FIRST_ESTIMATE_AFTER) return null;
  const fit = fitAnswers(answers, bands);
  const estimate = round100(fit.estimate);
  const low = Math.max(0, round100(fit.low));
  const high = round100(fit.high);
  const margin = Math.max(100, round100((high - low) / 2));
  const relative = margin / Math.max(estimate, 1000);
  const precision: Precision = relative < 0.2 ? 'high' : relative < 0.4 ? 'medium' : 'low';
  const wrong = answers.filter((a) => a.choice !== null && a.choice !== a.item.answer).length;
  return {
    estimate,
    margin,
    low,
    high,
    level: levelForEstimate(estimate),
    precision,
    answered: answers.length,
    capped: estimate >= CAP_ESTIMATE,
    guessing: wrong >= 6 && fit.guess >= GUESSING_LEVEL,
  };
}

export function levelForEstimate(n: number): CefrLevel {
  if (n < 1500) return 'A1';
  if (n < 2500) return 'A2';
  if (n < 3500) return 'B1';
  if (n < 5000) return 'B2';
  if (n < 6500) return 'C1';
  return 'C2';
}

function round100(n: number): number {
  return Math.round(n / 100) * 100;
}

/** `cov[i]` is the coverage at `(i + 1) * 1000` words; below 1000 it rises linearly from zero. */
export function coverageAt(
  cov: ReadonlyArray<number | null> | null | undefined,
  n: number,
): number | null {
  if (!Array.isArray(cov) || cov.length === 0) return null;
  if (!cov.every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
  const values = cov as number[];
  if (n <= 0) return 0;
  const position = n / 1000;
  if (position >= values.length) return values[values.length - 1];
  const lowerIndex = Math.floor(position) - 1;
  const lower = lowerIndex < 0 ? 0 : values[lowerIndex];
  const upper = values[lowerIndex + 1];
  return lower + (upper - lower) * (position - Math.floor(position));
}

export interface RecommendableBook {
  slug: string;
  level: string;
  cov?: ReadonlyArray<number | null> | null;
}

export function recommendBooks<T extends RecommendableBook>(
  books: readonly T[],
  estimate: number,
  level: CefrLevel,
  count = 6,
): Array<T & { coverage: number | null }> {
  const withCoverage = books.map((book) => ({ ...book, coverage: coverageAt(book.cov, estimate) }));
  const levels: string[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const target = levels.indexOf(level);
  const readable = withCoverage
    .filter((book) => {
      const index = levels.indexOf(book.level);
      return (
        index >= 0 &&
        book.coverage !== null &&
        book.coverage >= READABLE_COVERAGE &&
        (index === target || index === target - 1)
      );
    })
    .sort(
      (a, b) =>
        Math.abs(levels.indexOf(a.level) - target) - Math.abs(levels.indexOf(b.level) - target) ||
        (a.coverage as number) - (b.coverage as number),
    )
    .slice(0, count);
  if (readable.length >= count) return readable;
  const chosen = new Set(readable.map((book) => book.slug));
  const rest = withCoverage.filter((book) => !chosen.has(book.slug));
  return [...readable, ...pickNearLevel(rest, level, count - readable.length)];
}

/** Words answered wrong or "not sure", easiest first, up to the learner's level plus one band. */
export function missedWords(
  answers: readonly Answer[],
  estimate: number,
  bands: ReadonlyArray<Pick<VocabBand, 'to'>>,
  limit = 8,
): TestItem[] {
  return answers
    .filter(
      ({ item, choice }) =>
        choice !== item.answer &&
        bands[item.band] !== undefined &&
        bands[item.band].to <= estimate + 1000,
    )
    .map((answer) => answer.item)
    .sort((a, b) => a.band - b.band)
    .slice(0, limit);
}
