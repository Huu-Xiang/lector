/**
 * Anonymous daily AI timing: histogram buckets per (UTC date, key). No user id, text or IP.
 * Keys are `<label>.total`, `<label>.first`, `<label>.hit`, `<label>.miss`, `<label>.error`
 * and `<label>.timeout`.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Database } from 'bun:sqlite';
import { db } from '../db';
import type { LLMTask } from './llm/types';
import { recordProductEvent } from './product-analytics';

export const TIMING_LABELS = [
  'lookup',
  'gloss',
  'localize',
  'prefetch',
  'phrase',
  'context',
  'enrich',
  'chat',
  'other',
] as const;
export type TimingLabel = (typeof TIMING_LABELS)[number];

/** Upper bounds in ms. The last bucket holds everything slower. */
export const BUCKET_BOUNDS_MS = [
  50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 8000, 15000, 30000,
] as const;

const RETENTION_DAYS = 90;

const labelStore = new AsyncLocalStorage<TimingLabel>();

/** Runs fn so that every LLM call inside it counts under this label. */
export function withTimingLabel<T>(label: TimingLabel, fn: () => T): T {
  return labelStore.run(label, fn);
}

/** The label set by the nearest enclosing `withTimingLabel`, if any. */
export function currentTimingLabel(): TimingLabel | undefined {
  return labelStore.getStore();
}

export function labelForTask(task: LLMTask | undefined): TimingLabel {
  const forced = labelStore.getStore();
  if (forced) return forced;
  switch (task) {
    case 'word-gloss':
      return 'gloss';
    case 'phrase-simple':
    case 'phrase-rich':
      return 'phrase';
    case 'context-simple':
    case 'context-rich':
      return 'context';
    case 'word-enrichment':
      return 'enrich';
    case 'chat':
      return 'chat';
    default:
      return 'other';
  }
}

function bucketOf(ms: number): number {
  const i = BUCKET_BOUNDS_MS.findIndex((bound) => ms <= bound);
  return i === -1 ? BUCKET_BOUNDS_MS.length : i;
}

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

let prunedOn = '';

function bump(key: string, bucket: number, maxMs: number, now: Date): void {
  try {
    const date = utcDay(now);
    db.prepare(
      `INSERT INTO ai_timing_daily (date, key, bucket, count, maxMs) VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(date, key, bucket) DO UPDATE SET count = count + 1, maxMs = MAX(maxMs, excluded.maxMs)`,
    ).run(date, key, bucket, Math.round(maxMs));
    if (prunedOn !== date) {
      prunedOn = date;
      const cutoff = utcDay(new Date(now.getTime() - RETENTION_DAYS * 86_400_000));
      db.prepare('DELETE FROM ai_timing_daily WHERE date < ?').run(cutoff);
    }
  } catch {
    // Telemetry must never fail a request.
  }
}

export interface AiCallTiming {
  task?: LLMTask;
  totalMs: number;
  firstTokenMs?: number;
  success: boolean;
  timedOut?: boolean;
  retry?: boolean;
  tokenInput?: number;
  tokenOutput?: number;
  tokenTotal?: number;
}

export function recordAiCall(
  call: AiCallTiming,
  now: Date = new Date(),
  database?: Database,
): void {
  const label = labelForTask(call.task);
  if (call.success) {
    bump(`${label}.total`, bucketOf(call.totalMs), call.totalMs, now);
    if (call.firstTokenMs !== undefined) {
      bump(`${label}.first`, bucketOf(call.firstTokenMs), call.firstTokenMs, now);
      recordProductEvent(
        {
          event: 'ai_first_token',
          feature: label,
          latencyMs: Math.min(3_600_000, call.firstTokenMs),
        },
        { now, database },
      );
    }
  } else {
    bump(call.timedOut ? `${label}.timeout` : `${label}.error`, 0, 0, now);
  }
  recordProductEvent(
    {
      event: 'ai_attempt',
      feature: label,
      outcome: call.success ? 'success' : call.timedOut ? 'timeout' : 'error',
      step: call.retry ? 'retry' : undefined,
      latencyMs: Math.min(3_600_000, call.totalMs),
      tokenInput: call.tokenInput,
      tokenOutput: call.tokenOutput,
      tokenTotal: call.tokenTotal,
    },
    { now, database },
  );
}

/** Counts one lookup served from a dictionary or shared cache (hit) or sent to the AI (miss). */
export function recordLookupOutcome(
  label: TimingLabel,
  outcome: 'hit' | 'miss',
  now: Date = new Date(),
): void {
  bump(`${label}.${outcome}`, 0, 0, now);
  recordProductEvent({ event: 'ai_cache', feature: label, outcome }, { now });
}

export interface TaskTiming {
  label: TimingLabel;
  calls: number;
  p50: number | null;
  p95: number | null;
  max: number | null;
  firstP50: number | null;
  firstP95: number | null;
  firstMax: number | null;
  hits: number;
  misses: number;
  errors: number;
  timeouts: number;
}

interface Hist {
  counts: number[];
  max: number;
}

function newHist(): Hist {
  return { counts: new Array(BUCKET_BOUNDS_MS.length + 1).fill(0), max: 0 };
}

/** Upper bound of the bucket holding the quantile, capped by the observed max. */
function quantile(hist: Hist, q: number): number | null {
  const total = hist.counts.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const target = Math.ceil(total * q);
  let seen = 0;
  for (let i = 0; i < hist.counts.length; i++) {
    seen += hist.counts[i];
    if (seen >= target) {
      const bound = i < BUCKET_BOUNDS_MS.length ? BUCKET_BOUNDS_MS[i] : hist.max;
      return Math.min(bound, hist.max);
    }
  }
  return hist.max;
}

export interface DayTiming {
  date: string;
  tasks: TaskTiming[];
}

export interface AiTimingReport {
  days: DayTiming[];
  total: TaskTiming[];
}

function summarize(
  rows: { key: string; bucket: number; count: number; maxMs: number }[],
): TaskTiming[] {
  const out: TaskTiming[] = [];
  for (const label of TIMING_LABELS) {
    const total = newHist();
    const first = newHist();
    let hits = 0;
    let misses = 0;
    let errors = 0;
    let timeouts = 0;
    let seen = false;
    for (const row of rows) {
      const [rowLabel, kind] = row.key.split('.');
      if (rowLabel !== label) continue;
      seen = true;
      if (kind === 'total' || kind === 'first') {
        const hist = kind === 'total' ? total : first;
        hist.counts[row.bucket] += row.count;
        hist.max = Math.max(hist.max, row.maxMs);
      } else if (kind === 'hit') hits += row.count;
      else if (kind === 'miss') misses += row.count;
      else if (kind === 'error') errors += row.count;
      else if (kind === 'timeout') timeouts += row.count;
    }
    if (!seen) continue;
    const calls = total.counts.reduce((a, b) => a + b, 0);
    const firstCalls = first.counts.reduce((a, b) => a + b, 0);
    out.push({
      label,
      calls,
      p50: quantile(total, 0.5),
      p95: quantile(total, 0.95),
      max: calls ? total.max : null,
      firstP50: quantile(first, 0.5),
      firstP95: quantile(first, 0.95),
      firstMax: firstCalls ? first.max : null,
      hits,
      misses,
      errors,
      timeouts,
    });
  }
  return out;
}

/** Stats for the UTC days from..to, both included. */
export function aiTimingReport(from: string, to: string): AiTimingReport {
  const rows = db
    .prepare(
      `SELECT date, key, bucket, count, maxMs FROM ai_timing_daily
       WHERE date >= ? AND date <= ? ORDER BY date`,
    )
    .all(from, to) as { date: string; key: string; bucket: number; count: number; maxMs: number }[];
  const byDay = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byDay.get(row.date) ?? [];
    list.push(row);
    byDay.set(row.date, list);
  }
  return {
    days: [...byDay.entries()].map(([date, list]) => ({ date, tasks: summarize(list) })),
    total: summarize(rows),
  };
}

export function parseTimingDays(raw: string | undefined): 1 | 7 | 30 | 90 {
  const n = Number(raw);
  return n === 1 || n === 7 || n === 90 ? n : 30;
}

export function timingRangeEnds(
  days: number,
  now: Date = new Date(),
): { from: string; to: string } {
  return { from: utcDay(new Date(now.getTime() - (days - 1) * 86_400_000)), to: utcDay(now) };
}
