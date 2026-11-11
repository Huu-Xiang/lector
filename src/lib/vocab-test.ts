import { pickNearLevel } from './recommend';
import type { CefrLevel } from './reading-level';

export interface VocabBand {
  from: number;
  to: number;
  words: Array<{ w: string; zh?: string }>;
}

export interface VocabTestData {
  version?: number;
  bands: VocabBand[];
  pseudowords: string[];
  source?: string;
}

export interface TestItem {
  id: string;
  word: string;
  kind: 'real' | 'fake';
  /** Index into `bands`; -1 for a made-up word. */
  band: number;
  zh?: string;
}

export interface TestScore {
  estimate: number;
  low: number;
  high: number;
  falseAlarmRate: number;
  unreliable: boolean;
  level: CefrLevel;
}

export type Rng = () => number;

export const WORDS_PER_BAND = 4;
export const WORDS_IN_LAST_BAND = 5;
/** The 10,001-14,000 band is wider than the rest, so it gets one more word. */
const LAST_BAND_INDEX = 10;
export const FAKE_COUNT = 20;
export const UNRELIABLE_FALSE_ALARM_RATE = 0.25;
export const READABLE_COVERAGE = 0.95;

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

export function sampleTest(data: VocabTestData, rng: Rng): TestItem[] {
  const items: TestItem[] = [];
  data.bands.forEach((band, index) => {
    const count = index === LAST_BAND_INDEX ? WORDS_IN_LAST_BAND : WORDS_PER_BAND;
    for (const entry of shuffle(band.words, rng).slice(0, count)) {
      items.push({
        id: `r${index}:${entry.w}`,
        word: entry.w,
        kind: 'real',
        band: index,
        zh: entry.zh,
      });
    }
  });
  for (const word of shuffle(data.pseudowords, rng).slice(0, FAKE_COUNT)) {
    items.push({ id: `f:${word}`, word, kind: 'fake', band: -1 });
  }
  return shuffle(items, rng);
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

export function scoreTest(
  items: readonly TestItem[],
  knownIds: ReadonlySet<string>,
  bands: ReadonlyArray<Pick<VocabBand, 'from' | 'to'>>,
): TestScore {
  const fakes = items.filter((item) => item.kind === 'fake');
  const falseAlarmRate =
    fakes.length === 0 ? 0 : fakes.filter((item) => knownIds.has(item.id)).length / fakes.length;
  let estimate = 0;
  bands.forEach((band, index) => {
    const real = items.filter((item) => item.kind === 'real' && item.band === index);
    if (real.length === 0) return;
    const hitRate = real.filter((item) => knownIds.has(item.id)).length / real.length;
    const corrected =
      falseAlarmRate >= 1
        ? 0
        : Math.min(1, Math.max(0, (hitRate - falseAlarmRate) / (1 - falseAlarmRate)));
    estimate += corrected * (band.to - band.from + 1);
  });
  estimate = round100(estimate);
  return {
    estimate,
    low: round100(estimate * 0.85),
    high: round100(estimate * 1.15),
    falseAlarmRate,
    unreliable: falseAlarmRate > UNRELIABLE_FALSE_ALARM_RATE,
    level: levelForEstimate(estimate),
  };
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

export function missedWords(
  items: readonly TestItem[],
  knownIds: ReadonlySet<string>,
  estimate: number,
  bands: ReadonlyArray<Pick<VocabBand, 'to'>>,
  limit = 8,
): TestItem[] {
  return items
    .filter(
      (item) =>
        item.kind === 'real' &&
        !knownIds.has(item.id) &&
        bands[item.band] !== undefined &&
        bands[item.band].to <= estimate + 1000,
    )
    .sort((a, b) => a.band - b.band)
    .slice(0, limit);
}
