import { pickNearLevel } from './recommend';
import type { CefrLevel } from './reading-level';

/** A part of speech and the glosses available for that sense. */
export interface SenseRow {
  p: string;
  zh?: string[];
  ru?: string[];
  en: string;
}

export interface VocabWord {
  w: string;
  /** Frequency rank among English lemmas. */
  r: number;
  /** One or two rows, most common part of speech first. */
  s: SenseRow[];
}

export interface VocabBand {
  from: number;
  to: number;
  words: VocabWord[];
}

export interface VocabTestData {
  version?: number;
  answerLanguage?: 'ru';
  bands: VocabBand[];
  source?: string;
}

/**
 * One question: an English word, three meanings and "none of the above". `answer` is the index of
 * the right meaning, or NONE_OF_ABOVE when none of the three meanings is the word's.
 */
export interface TestItem {
  id: string;
  word: string;
  /** Index into `bands`. */
  band: number;
  rank: number;
  senses: SenseRow[];
  meanings: SenseRow[][];
  answer: number;
}

export interface Answer {
  item: TestItem;
  /** Index of the chosen option (NONE_OF_ABOVE included), or null for "not sure". */
  choice: number | null;
}

export type Rng = () => number;

export const OPTION_COUNT = 4;
export const NONE_OF_ABOVE = 3;
/** How often "none of the above" is the right answer: as often as each other option. */
const NONE_SHARE = 1 / OPTION_COUNT;
/** The result can be shown after this many answers; the test stops at the maximum. */
export const MIN_ANSWERS = 8;
export const MAX_ANSWERS = 120;
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

/**
 * Characters too common in meanings to make two meanings look alike. Keep in step with FILLER in
 * scripts/build-vocab-test.py, which drops words that cannot get three wrong options.
 */
const FILLER = new Set('的地得使之者人性化物一.…了');

const RUSSIAN_FILLER = new Set(['в', 'на', 'с', 'из', 'по', 'за', 'и', 'или', 'для', 'от', 'к']);

function meaningTokens(rows: readonly SenseRow[], answerLanguage?: 'ru'): Set<string> {
  if (answerLanguage === 'ru') {
    const glosses = rows.flatMap((row) =>
      (row.ru ?? []).map((meaning) => meaning.toLowerCase().replaceAll('ё', 'е')),
    );
    const words = glosses.flatMap((meaning) => meaning.match(/[а-я]+/g) ?? []);
    return new Set([
      ...glosses.map((meaning) => `=${meaning.trim()}`),
      ...words.filter((word) => !RUSSIAN_FILLER.has(word)),
    ]);
  }
  const out = new Set<string>();
  for (const row of rows)
    for (const m of row.zh ?? []) for (const c of m) if (!FILLER.has(c)) out.add(c);
  return out;
}

function overlaps(a: Set<string>, b: Set<string>): boolean {
  for (const c of a) if (b.has(c)) return true;
  return false;
}

/** Rough rendered width; keep in step with option_width in scripts/build-vocab-test.py. */
export function optionWidth(rows: readonly SenseRow[], answerLanguage?: 'ru'): number {
  if (answerLanguage === 'ru') {
    return rows.reduce((sum, row) => sum + (row.ru ?? []).join('; ').length, 0);
  }
  return rows.reduce(
    (sum, row) => sum + (row.zh ?? []).reduce((n, m) => n + m.length, 0) + 0.45 * row.en.length,
    0,
  );
}

function signature(rows: readonly SenseRow[]): string {
  return rows.map((row) => row.p).join('+');
}

function wordForms(w: string): Set<string> {
  return new Set([w, `${w}s`, `${w}es`, `${w}ed`, `${w}d`, `${w}ing`, `${w}er`, `${w}ly`]);
}

function englishWords(rows: readonly SenseRow[]): string[] {
  return rows.flatMap((row) => row.en.toLowerCase().match(/[a-z']+/g) ?? []);
}

function distractors(
  data: VocabTestData,
  band: number,
  target: VocabWord,
  count: number,
  avoid: ReadonlySet<string>,
  rng: Rng,
) {
  const order = data.bands
    .map((_, index) => index)
    .sort((a, b) => Math.abs(a - band) - Math.abs(b - band) || a - b);
  const targetTokens = meaningTokens(target.s, data.answerLanguage);
  const width = optionWidth(target.s, data.answerLanguage);
  const forms = wordForms(target.w);
  const picked: VocabWord[] = [];
  const pickedTokens: Set<string>[] = [];
  const passes: Array<{ match: (other: VocabWord) => boolean; similarWidth: boolean }> = [
    { match: (other) => signature(other.s) === signature(target.s), similarWidth: true },
    { match: (other) => other.s[0].p === target.s[0].p, similarWidth: true },
    // Last resort so an item always has its options; the build makes this pass unnecessary.
    { match: () => true, similarWidth: false },
  ];
  // Meanings already shown in feedback, in this test or an earlier one, come last, so a guesser
  // cannot rule them out.
  for (const { match, similarWidth } of passes) {
    for (const allowAvoided of [false, true]) {
      for (const index of order) {
        for (const other of shuffle(data.bands[index].words, rng)) {
          if (picked.length === count) return picked;
          if (other.w === target.w || picked.includes(other) || !match(other)) continue;
          if (!allowAvoided && avoid.has(other.w)) continue;
          const tokens = meaningTokens(other.s, data.answerLanguage);
          if (
            overlaps(tokens, targetTokens) ||
            pickedTokens.some((prior) => overlaps(prior, tokens))
          ) {
            continue;
          }
          const ratio = optionWidth(other.s, data.answerLanguage) / width;
          if (similarWidth && (ratio < 0.6 || ratio > 1.4)) continue;
          if (englishWords(other.s).some((word) => forms.has(word))) continue;
          picked.push(other);
          pickedTokens.push(tokens);
        }
      }
    }
  }
  return picked;
}

function makeItem(
  data: VocabTestData,
  band: number,
  index: number,
  avoid: ReadonlySet<string>,
  rng: Rng,
): TestItem {
  const entry = data.bands[band].words[index];
  const noneIsRight = rng() < NONE_SHARE;
  const wrong = distractors(data, band, entry, noneIsRight ? 3 : 2, avoid, rng).map(
    (word) => word.s,
  );
  const meanings = noneIsRight ? wrong : shuffle([entry.s, ...wrong], rng);
  return {
    id: `r${band}:${entry.w}`,
    word: entry.w,
    band,
    rank: entry.r,
    senses: entry.s,
    meanings,
    answer: noneIsRight ? NONE_OF_ABOVE : meanings.indexOf(entry.s),
  };
}

/** Shown before this many answers is not an estimate yet. */
export const FIRST_ESTIMATE_AFTER = 1;

// Three mid-frequency words, a log-rank staircase, then
// the fitted knee moved by FIT_SHIFT toward the last answer, with a log-normal spread.
const OPENING_COUNT = 3;
const OPENING_LOW = 2001;
const OPENING_HIGH = 5000;
const STAIRCASE_END = 16;
const STAIRCASE_START = Math.log(3200);
const STEP_FIRST = 0.9;
const STEP_DECAY = 0.85;
const STEP_MIN = 0.25;
const FIT_SHIFT = 0.1;
const FIT_SPREAD = 0.6;
/** Extra log-rank distance for a word asked in an earlier test on this device. */
const SEEN_PENALTY = 1;
const NOTHING_SEEN: ReadonlySet<string> = new Set();

function staircaseTarget(answers: readonly Answer[], maxRank: number): number {
  let target = STAIRCASE_START;
  answers.forEach((answer, i) => {
    const step =
      i < OPENING_COUNT
        ? 0.35
        : Math.max(STEP_MIN, STEP_FIRST * Math.pow(STEP_DECAY, i - OPENING_COUNT));
    target += answer.choice === answer.item.answer ? step : -step;
    target = Math.min(Math.log(maxRank), Math.max(Math.log(40), target));
  });
  return target;
}

/** A standard normal sample (Box-Muller). */
export function gaussian(rng: Rng): number {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

/** Where the next word should sit, as a log rank. */
export function nextTarget(answers: readonly Answer[], data: VocabTestData, rng: Rng): number {
  const maxRank = data.bands[data.bands.length - 1].to;
  if (answers.length < STAIRCASE_END) return staircaseTarget(answers, maxRank);
  const fit = fitAnswers(answers, data.bands);
  const last = answers[answers.length - 1];
  const shift = last.choice === last.item.answer ? FIT_SHIFT : -FIT_SHIFT;
  return Math.log(Math.max(fit.knee, 300)) + shift + FIT_SPREAD * gaussian(rng);
}

/** One generator per question number, so the same answers always lead to the same next word. */
function stepRng(seed: number, answered: number): Rng {
  return seededRng(Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) + answered * 0x27d4eb2f);
}

/**
 * The next question. `seen` holds words asked in earlier tests on this device; they are picked only
 * when no other word is near the target, and their meanings come last as wrong options.
 */
export function nextItem(
  answers: readonly Answer[],
  data: VocabTestData,
  seed: number,
  seen: ReadonlySet<string> = NOTHING_SEEN,
): TestItem | null {
  if (answers.length >= MAX_ANSWERS) return null;
  const rng = stepRng(seed, answers.length);
  const asked = new Set(answers.map((answer) => answer.item.word));
  const avoid = new Set([...asked, ...seen]);
  const fresh = data.bands.map((band) =>
    band.words.map((_, i) => i).filter((i) => !asked.has(band.words[i].w)),
  );
  const candidates = data.bands.flatMap((band, b) =>
    fresh[b].map((index) => ({ band: b, index, word: band.words[index] })),
  );
  if (!candidates.length) return null;
  if (answers.length < OPENING_COUNT) {
    const opening = candidates.filter(
      ({ word }) => word.r >= OPENING_LOW && word.r <= OPENING_HIGH,
    );
    const unseen = opening.filter(({ word }) => !seen.has(word.w));
    const pool = unseen.length ? unseen : opening;
    if (pool.length) {
      const pick = pool[Math.floor(rng() * pool.length)];
      return makeItem(data, pick.band, pick.index, avoid, rng);
    }
  }
  const target = nextTarget(answers, data, rng);
  const distance = (word: VocabWord) =>
    Math.abs(Math.log(word.r) - target) + (seen.has(word.w) ? SEEN_PENALTY : 0);
  const ranked = candidates
    .map((candidate) => ({ ...candidate, distance: distance(candidate.word) }))
    .sort((a, b) => a.distance - b.distance);
  const near = ranked
    .slice(0, 8)
    .filter((candidate) => candidate.distance <= ranked[0].distance + 0.08);
  const unseen = near.filter(({ word }) => !seen.has(word.w));
  const pool = unseen.length ? unseen : near;
  const pick = pool[Math.floor(rng() * pool.length)];
  return makeItem(data, pick.band, pick.index, avoid, rng);
}

/**
 * The next question for each outcome of the current one, prepared while the learner reads it. A
 * wrong answer and "not sure" share a branch, built as if the learner said "not sure".
 */
export function prepareNext(
  answers: readonly Answer[],
  item: TestItem,
  data: VocabTestData,
  seed: number,
  seen: ReadonlySet<string> = NOTHING_SEEN,
): { right: TestItem | null; notRight: TestItem | null } {
  return {
    right: nextItem([...answers, { item, choice: item.answer }], data, seed, seen),
    notRight: nextItem([...answers, { item, choice: null }], data, seed, seen),
  };
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
/** The log-likelihood drop that bounds the shown range, meant as a 90% range. */
const DROP_90 = 2.6;

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
