import type { Database } from 'bun:sqlite';
import { db } from '../db';
import { isProductPublicBook } from './product-events';

const MAX_ROWS = 2500;
const SOURCES = ['google_search_console', 'bing_webmaster_tools'];
const PUBLIC_PAGES = new Set(['/', '/landing', '/books', '/vocab-test', '/pricing', '/about']);
type SearchRow = { date: string; page: string; query: string; clicks: number; impressions: number };

function validDate(value: unknown, now: Date): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  const earliest = new Date(now);
  earliest.setUTCFullYear(earliest.getUTCFullYear() - 2);
  return value >= earliest.toISOString().slice(0, 10) && date <= now;
}

function validPage(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value === '' || PUBLIC_PAGES.has(value)) return true;
  if (/^\/books\/[a-z]{2,3}(?:\/level\/[abc][12])?$/.test(value)) return true;
  return value.startsWith('/books/') && isProductPublicBook(value.slice('/books/'.length));
}

function validNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1e9;
}

/** Import a selected public search report. Never follow URLs or store a per-search record. */
export function importProductSearchReport(
  input: unknown,
  now = new Date(),
  database: Database = db,
): number | null {
  if (!input || typeof input !== 'object') return null;
  const { source, rows } = input as { source?: unknown; rows?: unknown };
  if (
    typeof source !== 'string' ||
    !SOURCES.includes(source) ||
    !Array.isArray(rows) ||
    !rows.length ||
    rows.length > MAX_ROWS
  )
    return null;
  const parsed: SearchRow[] = [];
  for (const item of rows) {
    if (
      !item ||
      typeof item !== 'object' ||
      Object.keys(item).some(
        (key) => !['date', 'page', 'query', 'clicks', 'impressions'].includes(key),
      )
    )
      return null;
    const { date, page = '', query = '', clicks, impressions } = item as Record<string, unknown>;
    if (
      !validDate(date, now) ||
      !validPage(page) ||
      typeof query !== 'string' ||
      query.length > 200 ||
      /[\x00-\x1f\x7f]/.test(query) ||
      !validNumber(clicks) ||
      !validNumber(impressions) ||
      clicks > impressions
    )
      return null;
    parsed.push({ date, page, query, clicks, impressions });
  }
  database.transaction(() => {
    const upsert = database.prepare(
      `INSERT INTO product_search_daily (source,date,page,query,clicks,impressions) VALUES (?,?,?,?,?,?)
       ON CONFLICT(source,date,page,query) DO UPDATE SET clicks=excluded.clicks,impressions=excluded.impressions`,
    );
    for (const row of parsed)
      upsert.run(source, row.date, row.page, row.query, row.clicks, row.impressions);
  })();
  return parsed.length;
}
