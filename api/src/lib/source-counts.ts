/**
 * Anonymous daily counts of visits and sign-ups per traffic source. A row is
 * (UTC date, source, lang, event) and a count. No user id, IP, referrer URL or
 * user agent is stored, so the operator cannot see one person's path.
 */
import { db } from '../db';
import {
  LANGS,
  SOURCES,
  isLang,
  isSource,
  type Lang,
  type Source,
  type SourceEvent,
} from './source-list';

export interface SourceTotals {
  source: Source;
  visits: number;
  signups: number;
}

export interface SourceReport {
  sources: SourceTotals[];
  langs: Record<Lang, { visits: number; signups: number }>;
}

export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Adds one to a counter. Returns false, writing nothing, when a value is off the closed lists. */
export function recordSourceEvent(
  event: SourceEvent,
  source: unknown,
  lang: unknown,
  now: Date = new Date(),
): boolean {
  if (!isSource(source) || !isLang(lang)) return false;
  db.prepare(
    `INSERT INTO source_counts (date, source, lang, event, count) VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(date, source, lang, event) DO UPDATE SET count = count + 1`,
  ).run(utcDay(now), source, lang, event);
  return true;
}

/** Totals for the UTC days from..to, both included. Busiest source first. */
export function sourceReport(from: string, to: string): SourceReport {
  const rows = db
    .prepare(
      `SELECT source, lang, event, SUM(count) AS total FROM source_counts
       WHERE date >= ? AND date <= ? GROUP BY source, lang, event`,
    )
    .all(from, to) as { source: string; lang: string; event: string; total: number }[];

  const bySource = new Map<Source, SourceTotals>(
    SOURCES.map((source) => [source, { source, visits: 0, signups: 0 }]),
  );
  const langs = Object.fromEntries(
    LANGS.map((lang) => [lang, { visits: 0, signups: 0 }]),
  ) as SourceReport['langs'];

  for (const row of rows) {
    if (!isSource(row.source) || !isLang(row.lang)) continue;
    const key = row.event === 'signup' ? 'signups' : row.event === 'visit' ? 'visits' : null;
    if (!key) continue;
    bySource.get(row.source)![key] += row.total;
    langs[row.lang][key] += row.total;
  }

  const sources = [...bySource.values()]
    .filter((s) => s.visits > 0 || s.signups > 0)
    .sort((a, b) => b.visits - a.visits || b.signups - a.signups);
  return { sources, langs };
}
