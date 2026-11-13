import '../test-guard';
import { beforeEach, describe, expect, test } from 'bun:test';
import { db } from '../db';
import { purgeTenantData } from './account-deletion';
import {
  maintainProductAnalytics,
  productAnalyticsReport,
  recordProductEvent,
  recordProductSignup,
} from './product-analytics';
import { parseProductEvent } from './product-events';
import { importProductSearchReport } from './product-search-report';

const joined = new Date('2026-11-01T08:00:00Z');
const opted = { database: db };

beforeEach(() => {
  for (const table of [
    'product_events',
    'product_daily',
    'product_attribution',
    'product_receipts',
    'product_cohorts',
    'product_analytics_state',
    'product_search_daily',
  ])
    db.run(`DELETE FROM ${table}`);
});

describe('product analytics', () => {
  test('allows only known fields and enum values', () => {
    expect(
      parseProductEvent({ event: 'page_view', feature: 'book', browserLanguage: 'en' }, true),
    ).toEqual({ event: 'page_view', feature: 'book', browserLanguage: 'en' });
    expect(parseProductEvent({ event: 'page_view', feature: 'arbitrary text' }, true)).toBeNull();
    expect(parseProductEvent({ event: 'page_view', text: 'private answer' }, true)).toBeNull();
    expect(parseProductEvent({ event: 'reading_started', lessonId: 'abc' }, true)).toBeNull();
    expect(parseProductEvent({ event: 'payment_succeeded' }, false)).toBeNull();
    expect(parseProductEvent({ event: 'review_completed', language: 'en' }, false)).toBeNull();
    expect(parseProductEvent({ event: 'quiz_progress', language: 'en' }, true)).toBeNull();
  });

  test('reimporting an authorized search row updates its aggregate without duplicating it', () => {
    const report = {
      source: 'google_search_console',
      rows: [
        {
          date: '2026-11-01',
          page: '/books/en',
          query: 'free graded readers',
          clicks: 3,
          impressions: 20,
        },
      ],
    };
    expect(importProductSearchReport(report, joined, db)).toBe(1);
    expect(
      importProductSearchReport(
        { ...report, rows: [{ ...report.rows[0], clicks: 4 }] },
        joined,
        db,
      ),
    ).toBe(1);
    expect(productAnalyticsReport(7, joined, db).search).toEqual([
      expect.objectContaining({ clicks: 4, impressions: 20, source: 'google_search_console' }),
    ]);
    expect(
      importProductSearchReport(
        {
          ...report,
          rows: [{ ...report.rows[0], page: '/read/private-lesson' }],
        },
        joined,
        db,
      ),
    ).toBeNull();
  });

  test('counts anonymous actions once across retries with no account rows', () => {
    const event = { event: 'quiz_finished', language: 'en', value: 20 };
    recordProductEvent(event, { ...opted, now: joined, key: 'quiz-001' });
    recordProductEvent(event, { ...opted, now: joined, key: 'quiz-001' });
    const report = productAnalyticsReport(7, joined, db);
    expect(report.daily.find((row) => row.event === 'quiz_finished')).toMatchObject({
      count: 1,
      value: 20,
    });
    expect(db.query('SELECT COUNT(*) count FROM product_events').get()).toEqual({ count: 0 });
  });

  test('deduplicates first signup and uses exact matured calendar days', () => {
    for (let i = 1; i <= 5; i++) {
      recordProductSignup({ ...opted, userId: `cohort-${i}`, source: 'chatgpt', now: joined });
      recordProductSignup({ ...opted, userId: `cohort-${i}`, source: 'google', now: joined });
    }
    recordProductEvent(
      { event: 'word_lookup', language: 'en' },
      { ...opted, userId: 'cohort-1', now: new Date('2026-11-02T01:00:00Z') },
    );
    recordProductEvent(
      { event: 'word_lookup', language: 'en' },
      { ...opted, userId: 'cohort-1', now: new Date('2026-11-08T02:00:00Z') },
    );
    recordProductEvent(
      { event: 'word_lookup', language: 'en' },
      { ...opted, userId: 'cohort-2', now: new Date('2026-11-09T01:00:00Z') },
    );
    const now = new Date('2026-11-09T12:00:00Z');
    maintainProductAnalytics(now, db);
    const report = productAnalyticsReport(30, now, db);
    expect(
      report.cohorts.find((row) => row.metric === 'd7' && row.source === 'chatgpt'),
    ).toMatchObject({ eligible: 5, returned: 1 });
    expect(report.cohorts.some((row) => row.metric === 'd14')).toBe(false);
    expect(report.daily.filter((row) => row.event === 'signup_created')).toHaveLength(1);
  });

  test('rolls up expired account cohorts and erases account-linked rows', () => {
    recordProductSignup({ ...opted, userId: 'delete-me', source: 'chatgpt', now: joined });
    recordProductEvent(
      { event: 'word_lookup', language: 'en' },
      { ...opted, userId: 'delete-me', now: joined },
    );
    maintainProductAnalytics(new Date('2027-02-05T00:00:00Z'), db);
    expect(db.query('SELECT COUNT(*) count FROM product_events').get()).toEqual({ count: 0 });
    expect(db.query('SELECT COUNT(*) count FROM product_attribution').get()).toEqual({ count: 0 });
    expect(
      db.query("SELECT eligible,returned FROM product_cohorts WHERE metric='d7'").get(),
    ).toEqual({ eligible: 1, returned: 0 });
    expect(productAnalyticsReport(180, new Date('2027-02-05T00:00:00Z'), db).cohorts).toEqual([]);
    recordProductSignup({
      ...opted,
      userId: 'delete-me',
      source: 'google',
      now: new Date('2027-02-05T00:00:00Z'),
    });
    purgeTenantData('delete-me', 'delete-me@example.test');
    expect(db.query('SELECT COUNT(*) count FROM product_attribution').get()).toEqual({ count: 0 });
    expect(db.query('SELECT COUNT(*) count FROM product_events').get()).toEqual({ count: 0 });
  });
});
