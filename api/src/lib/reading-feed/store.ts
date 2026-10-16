import { createHash } from 'crypto';
import { db } from '../../db';
import type { CefrLevel, FeedLanguage, ReadingFeedRow, ReadingInterest } from './types';

const MAX_ROWS_PER_BUCKET = 30;

export function readingFeedIdFor(url: string): string {
  return `reading-feed-${createHash('sha256').update(url).digest('hex')}`;
}

export function upsertReadingFeedArticle(row: {
  language: FeedLanguage;
  interest: ReadingInterest;
  source: string;
  title: string;
  url: string;
  author: string | null;
  license: string;
  licenseUrl: string;
  publishedAt: string;
  text: string;
  wordCount: number;
  level: CefrLevel;
  fetchedAt: string;
}): void {
  const id = readingFeedIdFor(row.url);
  db.prepare(
    `INSERT INTO reading_feed
      (id, language, interest, source, title, url, author, license, licenseUrl, publishedAt, text, wordCount, level, fetchedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET
       title = excluded.title,
       author = excluded.author,
       license = excluded.license,
       licenseUrl = excluded.licenseUrl,
       publishedAt = excluded.publishedAt,
       text = excluded.text,
       wordCount = excluded.wordCount,
       level = excluded.level,
       fetchedAt = excluded.fetchedAt`,
  ).run(
    id,
    row.language,
    row.interest,
    row.source,
    row.title,
    row.url,
    row.author,
    row.license,
    row.licenseUrl,
    row.publishedAt,
    row.text,
    row.wordCount,
    row.level,
    row.fetchedAt,
  );
}

/** Keeps the newest MAX_ROWS_PER_BUCKET rows per language+interest, prunes the rest. */
export function pruneReadingFeed(language: FeedLanguage, interest: ReadingInterest): void {
  db.prepare(
    `DELETE FROM reading_feed
     WHERE language = ? AND interest = ?
       AND id NOT IN (
         SELECT id FROM reading_feed
         WHERE language = ? AND interest = ?
         ORDER BY publishedAt DESC
         LIMIT ?
       )`,
  ).run(language, interest, language, interest, MAX_ROWS_PER_BUCKET);
}

export function listReadingFeed(language: FeedLanguage, interest: ReadingInterest): ReadingFeedRow[] {
  return db
    .prepare(
      `SELECT id, language, interest, source, title, url, author, license, licenseUrl,
              publishedAt, wordCount, level, fetchedAt
       FROM reading_feed
       WHERE language = ? AND interest = ?
       ORDER BY publishedAt DESC`,
    )
    .all(language, interest) as ReadingFeedRow[];
}

export function getReadingFeedArticle(id: string): ReadingFeedRow | undefined {
  return db.prepare('SELECT * FROM reading_feed WHERE id = ?').get(id) as ReadingFeedRow | undefined;
}
