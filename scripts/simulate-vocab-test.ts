// Accuracy check for src/lib/vocab-test.ts with simulated learners (shapes in knowShare).
// Run: bun scripts/simulate-vocab-test.ts [shapes=A,B,C] [answers=40,80] [runs=150] [unsure=0.7]
import fs from 'node:fs';
import path from 'node:path';
import {
  OPTION_COUNT,
  estimateFromAnswers,
  gaussian,
  nextItem,
  prepareNext,
  seededRng,
  type Answer,
  type TestItem,
  type VocabTestData,
} from '../src/lib/vocab-test';

// Run from the repository root.
const file = path.join(process.cwd(), 'languages', 'en', 'content', 'vocab-test.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8')) as VocabTestData;
const MAX_RANK = data.bands[data.bands.length - 1].to;
const SIZES = [500, 1000, 2000, 3500, 5000, 8000, 12000, 18000, 27000];

const [shapesArg = 'A,B,C', stopsArg = '40,80', runsArg = '150', unsureArg = '0.7'] =
  process.argv.slice(2);
const RUNS = Number(runsArg);
const UNSURE = Number(unsureArg);

const ramp = (r: number, k: number) => Math.min(1, Math.max(0, (1.5 * k - r) / k));
const knowShare: Record<string, (rank: number, k: number) => number> = {
  A: (r, k) => 1 / (1 + Math.exp((r - k) / (0.25 * k))),
  B: ramp,
  C: (r, k) => 1 / (1 + Math.exp((Math.log(r) - Math.log(k)) / 0.35)),
};

/** The true number of known words up to the last band, for knee k. */
function truth(shape: string, k: number): number {
  let total = 0;
  for (let r = 1; r <= MAX_RANK; r += 10) {
    if (shape !== 'B') {
      total += 10 * knowShare[shape](r, k);
      continue;
    }
    // Average the ramp over the word noise used in the simulation below.
    let mean = 0;
    for (let j = -2; j <= 2; j += 0.5)
      mean += ramp(r * Math.exp(0.4 * j), k) * Math.exp((-j * j) / 2);
    total += (10 * mean) / 4.513;
  }
  return total;
}

function runOnce(shape: string, k: number, stop: number, seed: number) {
  const rng = seededRng(seed);
  const noise = new Map<string, number>();
  const answers: Answer[] = [];
  let item: TestItem | null = nextItem(answers, data, seed);
  while (item && answers.length < stop) {
    const prepared = prepareNext(answers, item, data, seed);
    let rank = item.rank;
    if (shape === 'B') {
      if (!noise.has(item.id)) noise.set(item.id, gaussian(rng));
      rank *= Math.exp(0.4 * noise.get(item.id)!);
    }
    const knows = rng() < knowShare[shape](rank, k);
    const choice = knows ? item.answer : rng() < UNSURE ? null : Math.floor(rng() * OPTION_COUNT);
    answers.push({ item, choice });
    item = choice === item.answer ? prepared.right : prepared.notRight;
  }
  return estimateFromAnswers(answers, data.bands)!;
}

const percentile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[Math.floor(p * (values.length - 1))];
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const round100 = (n: number) => Math.round(n / 100) * 100;

for (const shape of shapesArg.split(',')) {
  for (const stop of stopsArg.split(',').map(Number)) {
    console.log(`\nshape ${shape}, ${stop} answers, ${RUNS} runs, unsure ${UNSURE}`);
    console.log('  true | mean est  [p10 .. p90]  | bias | ±margin | inside | tip');
    for (const k of SIZES) {
      const target = truth(shape, k);
      const estimates: number[] = [];
      const margins: number[] = [];
      let inside = 0;
      let tip = 0;
      for (let run = 1; run <= RUNS; run++) {
        const result = runOnce(shape, k, stop, run * 7919 + k * 3 + stop);
        estimates.push(result.estimate);
        margins.push(result.margin);
        if (target >= result.low && target <= result.high) inside++;
        if (result.guessing) tip++;
      }
      const bias = (mean(estimates) - target) / target;
      console.log(
        `${String(round100(target)).padStart(6)} | ${String(round100(mean(estimates))).padStart(6)} ` +
          `[${percentile(estimates, 0.1)} .. ${percentile(estimates, 0.9)}] | ` +
          `${(bias * 100).toFixed(0).padStart(4)}% | ±${round100(mean(margins))} | ` +
          `${Math.round((inside / RUNS) * 100)}% | ${Math.round((tip / RUNS) * 100)}%`,
      );
    }
  }
}
