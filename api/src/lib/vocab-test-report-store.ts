import {
  isVocabReportAttemptId,
  VOCAB_REPORT_LEVELS,
  VOCAB_REPORT_LOCALES,
  type VocabReport,
  type VocabReportCursor,
  type VocabReportDeliveryStatus,
  type VocabReportPage,
  type VocabReportSnapshot,
} from '../../../languages/en/vocab-report';
import { db } from '../db';
import { listLibraryBooks } from './library-content';
import { recordProductEvent } from './product-analytics';
import { VOCAB_REPORT_SAFE_RETRY_MS } from './vocab-test-report-policy';

export type VocabReportBackup = Pick<VocabReport, 'snapshot' | 'books'>;

const BOOK_SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const MAX_RECOMMENDATIONS = 6;
export const VOCAB_REPORT_PAGE_SIZE = 30;
const MAX_VOCAB_SIZE = 40_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isVocabSize(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_VOCAB_SIZE
  );
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

export function parseVocabReportSnapshot(value: unknown): VocabReportSnapshot | undefined {
  if (!isRecord(value)) return undefined;
  const { attemptId, takenAt, locale, estimate, margin, low, high, capped, level, bookSlugs } =
    value;
  if (
    !isVocabReportAttemptId(attemptId) ||
    !isIsoDate(takenAt) ||
    !VOCAB_REPORT_LOCALES.some((allowed) => locale === allowed) ||
    !VOCAB_REPORT_LEVELS.some((allowed) => level === allowed) ||
    !isVocabSize(estimate) ||
    !isVocabSize(margin) ||
    !isVocabSize(low) ||
    !isVocabSize(high) ||
    low > estimate ||
    estimate > high ||
    typeof capped !== 'boolean' ||
    !Array.isArray(bookSlugs) ||
    bookSlugs.length > MAX_RECOMMENDATIONS ||
    !bookSlugs.every((slug): slug is string => typeof slug === 'string' && BOOK_SLUG.test(slug)) ||
    new Set(bookSlugs).size !== bookSlugs.length
  ) {
    return undefined;
  }
  return {
    attemptId,
    takenAt,
    locale: locale as VocabReportSnapshot['locale'],
    estimate,
    margin,
    low,
    high,
    capped,
    level: level as VocabReportSnapshot['level'],
    bookSlugs,
  };
}

let reportBookCatalog: Map<string, ReturnType<typeof listLibraryBooks>[number]> | undefined;

function getReportBookCatalog() {
  if (!reportBookCatalog) {
    reportBookCatalog = new Map(listLibraryBooks('en').map((book) => [book.slug, book]));
  }
  return reportBookCatalog;
}

export function resolveVocabReportBooks(
  snapshot: VocabReportSnapshot,
): VocabReport['books'] | undefined {
  if (snapshot.bookSlugs.length === 0) return [];
  const catalog = getReportBookCatalog();
  const books: VocabReport['books'] = [];
  for (const slug of snapshot.bookSlugs) {
    const book = catalog.get(slug);
    if (!book) return undefined;
    books.push({ slug, title: book.titles[snapshot.locale] ?? book.titles.en ?? book.title });
  }
  return books;
}

/** Backups keep frozen display titles, including books that have since left the catalog. */
export function parseVocabReportBackup(value: unknown): VocabReportBackup | undefined {
  if (!isRecord(value)) return undefined;
  const snapshot = parseVocabReportSnapshot(value.snapshot);
  if (
    !snapshot ||
    !Array.isArray(value.books) ||
    value.books.length !== snapshot.bookSlugs.length
  ) {
    return undefined;
  }
  const books: VocabReport['books'] = [];
  for (const [index, item] of value.books.entries()) {
    const slug = snapshot.bookSlugs[index];
    if (
      !isRecord(item) ||
      item.slug !== slug ||
      typeof item.title !== 'string' ||
      item.title.length === 0 ||
      item.title.length > 500 ||
      CONTROL.test(item.title)
    ) {
      return undefined;
    }
    books.push({ slug, title: item.title });
  }
  return { snapshot, books };
}

export function insertVocabReport(
  userId: string,
  { snapshot, books }: VocabReportBackup,
  deliveryStatus: 'pending' | 'restored',
): boolean {
  return (
    db
      .prepare(
        `INSERT INTO vocab_test_reports (userId, attemptId, snapshotJson, booksJson, deliveryStatus)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (userId, attemptId) DO NOTHING`,
      )
      .run(
        userId,
        snapshot.attemptId,
        JSON.stringify(snapshot),
        JSON.stringify(books),
        deliveryStatus,
      ).changes > 0
  );
}

export function expireVocabReportDeliveries(userId: string, now = Date.now()): void {
  db.transaction(() => {
    const expired = db
      .prepare(
        `UPDATE vocab_test_report_deliveries
         SET state = 'held', payloadJson = NULL, leaseId = NULL, leaseUntil = NULL
         WHERE userId = ? AND firstAttemptAt IS NOT NULL AND firstAttemptAt <= ?
           AND (state = 'unknown' OR (state = 'sending' AND COALESCE(leaseUntil, 0) <= ?))`,
      )
      .run(userId, now - VOCAB_REPORT_SAFE_RETRY_MS, now);
    if (!expired.changes) return;
    const held = db
      .query<{ attemptId: string }, [string, string, number]>(
        `UPDATE vocab_test_reports SET deliveryStatus = 'held'
         WHERE userId = ? AND deliveryStatus IN ('sending', 'unknown')
           AND attemptId IN (
             SELECT attemptId FROM vocab_test_report_deliveries
             WHERE userId = ? AND state = 'held' AND firstAttemptAt <= ?
           )
         RETURNING attemptId`,
      )
      .all(userId, userId, now - VOCAB_REPORT_SAFE_RETRY_MS);
    for (const { attemptId } of held) {
      recordProductEvent(
        { event: 'report_delivery', language: 'en', outcome: 'held' },
        { userId, key: `${attemptId}:held`, now: new Date(now) },
      );
    }
  }).immediate();
}

type ReportRow = {
  snapshotJson: string;
  booksJson: string;
  deliveryStatus: VocabReportDeliveryStatus;
  firstAttemptAt: number | null;
};

function toReport(row: ReportRow): VocabReport {
  const report: VocabReport = {
    snapshot: JSON.parse(row.snapshotJson),
    books: JSON.parse(row.booksJson),
    deliveryStatus: row.deliveryStatus,
  };
  if (row.deliveryStatus === 'unknown' && row.firstAttemptAt !== null) {
    report.retryUntil = row.firstAttemptAt + VOCAB_REPORT_SAFE_RETRY_MS;
  }
  return report;
}

const reportSelect = `
  SELECT report.snapshotJson, report.booksJson, delivery.firstAttemptAt,
    CASE
      WHEN report.deliveryStatus = 'sending' AND COALESCE(delivery.leaseUntil, 0) <= ?
        THEN CASE WHEN delivery.payloadJson IS NOT NULL AND delivery.firstAttemptAt IS NOT NULL
                  THEN 'unknown' ELSE 'failed' END
      ELSE report.deliveryStatus
    END AS deliveryStatus
  FROM vocab_test_reports AS report
  LEFT JOIN vocab_test_report_deliveries AS delivery
    ON report.userId = delivery.userId AND report.attemptId = delivery.attemptId
`;

export function getVocabReport(userId: string, attemptId: string): VocabReport | undefined {
  const row = db
    .prepare<
      ReportRow,
      [number, string, string]
    >(`${reportSelect} WHERE report.userId = ? AND report.attemptId = ?`)
    .get(Date.now(), userId, attemptId);
  return row ? toReport(row) : undefined;
}

export function parseVocabReportCursor(
  takenAt: string | undefined,
  attemptId: string | undefined,
): VocabReportCursor | undefined {
  if (!takenAt && !attemptId) return undefined;
  if (!isIsoDate(takenAt) || !isVocabReportAttemptId(attemptId)) return undefined;
  return { takenAt, attemptId };
}

export function exportVocabReports(userId: string): VocabReportBackup[] {
  return db
    .prepare<{ snapshotJson: string; booksJson: string }, [string]>(
      'SELECT snapshotJson, booksJson FROM vocab_test_reports WHERE userId = ?',
    )
    .all(userId)
    .map(({ snapshotJson, booksJson }) => ({
      snapshot: JSON.parse(snapshotJson) as VocabReportSnapshot,
      books: JSON.parse(booksJson) as VocabReport['books'],
    }));
}

export function listVocabReports(userId: string, cursor?: VocabReportCursor): VocabReportPage {
  expireVocabReportDeliveries(userId);
  const rows = cursor
    ? db
        .prepare<ReportRow, [number, string, string, string, number]>(
          `${reportSelect}
           WHERE report.userId = ? AND
             (json_extract(report.snapshotJson, '$.takenAt'), report.attemptId) < (?, ?)
           ORDER BY json_extract(report.snapshotJson, '$.takenAt') DESC, report.attemptId DESC
           LIMIT ?`,
        )
        .all(Date.now(), userId, cursor.takenAt, cursor.attemptId, VOCAB_REPORT_PAGE_SIZE + 1)
    : db
        .prepare<ReportRow, [number, string, number]>(
          `${reportSelect}
           WHERE report.userId = ?
           ORDER BY json_extract(report.snapshotJson, '$.takenAt') DESC, report.attemptId DESC
           LIMIT ?`,
        )
        .all(Date.now(), userId, VOCAB_REPORT_PAGE_SIZE + 1);
  const hasMore = rows.length > VOCAB_REPORT_PAGE_SIZE;
  const reports = rows.slice(0, VOCAB_REPORT_PAGE_SIZE).map(toReport);
  const last = reports.at(-1);
  return {
    reports,
    nextCursor:
      hasMore && last
        ? { takenAt: last.snapshot.takenAt, attemptId: last.snapshot.attemptId }
        : null,
  };
}
