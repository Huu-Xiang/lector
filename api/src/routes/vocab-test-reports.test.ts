import '../test-guard';
import { afterEach, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import type { VocabReportSnapshot } from '../../../languages/en/vocab-report';
import { db } from '../db';
import { listLibraryBooks } from '../lib/library-content';
import { VOCAB_REPORT_SAFE_RETRY_MS } from '../lib/vocab-test-report-policy';
import { insertVocabReport } from '../lib/vocab-test-report-store';
import { createVocabTestReportsApp } from './vocab-test-reports';

const ADA = 'report-route-ada';
const BOB = 'report-route-bob';
const takenAt = '2026-11-01T00:00:00.000Z';
const attemptId = 'cd24a01c-b95f-4537-bbdc-a06fb3a3bed1';
const snapshot: VocabReportSnapshot = {
  attemptId,
  takenAt,
  locale: 'zh-CN',
  estimate: 4000,
  margin: 500,
  low: 3500,
  high: 4500,
  capped: false,
  level: 'B2',
  bookSlugs: [],
};

function build({
  authRequired = true,
  userId = ADA,
  verified = true,
  allowWrite = true,
  deliveredStatus = 'sent',
} = {}) {
  const calls: [string, string][] = [];
  const app = new Hono();
  app.use('*', async (c, next) => {
    if (userId) c.set('userId', userId);
    await next();
  });
  app.route(
    '/',
    createVocabTestReportsApp({
      authRequired,
      isVerified: () => verified,
      tryWrite: () => allowWrite,
      deliver: async (owner, id) => {
        calls.push([owner, id]);
        db.prepare(
          'UPDATE vocab_test_reports SET deliveryStatus = ? WHERE userId = ? AND attemptId = ?',
        ).run(deliveredStatus, owner, id);
      },
    }),
  );
  return { app, calls };
}

function post(app: Hono, body: unknown, path = '/', headers: Record<string, string> = {}) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  db.prepare('DELETE FROM vocab_test_report_deliveries WHERE userId IN (?, ?)').run(ADA, BOB);
  db.prepare('DELETE FROM vocab_test_reports WHERE userId IN (?, ?)').run(ADA, BOB);
  db.prepare('DELETE FROM settings WHERE userId IN (?, ?)').run(ADA, BOB);
});

describe('account vocabulary test reports', () => {
  test('duplicate saves keep the original result and send once without changing the reading level', async () => {
    const { app, calls } = build();
    db.prepare('INSERT INTO settings (userId, key, value) VALUES (?, ?, ?)').run(
      ADA,
      'readingLevels',
      '{"en":"A1"}',
    );
    const save = () => post(app, { expectedUserId: ADA, snapshot });
    const responses = await Promise.all([save(), save()]);
    expect(responses.map((res) => res.status).sort()).toEqual([200, 201]);
    expect(calls).toEqual([[ADA, attemptId]]);
    const repeated = await post(app, {
      expectedUserId: ADA,
      snapshot: { ...snapshot, estimate: 4100 },
    });
    expect(await repeated.json()).toEqual({ snapshot, books: [], deliveryStatus: 'sent' });
    const list = await app.request('/');
    expect(list.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await list.json()).toEqual({
      reports: [{ snapshot, books: [], deliveryStatus: 'sent' }],
      nextCursor: null,
    });
    expect(
      db
        .prepare('SELECT value FROM settings WHERE userId = ? AND key = ?')
        .get(ADA, 'readingLevels'),
    ).toEqual({ value: '{"en":"A1"}' });
  });

  test('isolates account history and refuses retry from a second account', async () => {
    await post(build().app, { expectedUserId: ADA, snapshot });
    const other = build({ userId: BOB });
    expect(await (await other.app.request('/')).json()).toEqual({ reports: [], nextCursor: null });
    expect((await post(other.app, { expectedUserId: BOB }, `/${attemptId}/retry`)).status).toBe(
      404,
    );
    expect((await post(other.app, { expectedUserId: ADA, snapshot })).status).toBe(409);
    expect(other.calls).toEqual([]);
  });

  test('uses the shipped localized titles and omits raw answers from the saved result', async () => {
    const book = listLibraryBooks('en')[0];
    expect(book).toBeDefined();
    const { app } = build();
    const submitted = { ...snapshot, bookSlugs: [book.slug] };
    const response = await post(app, {
      expectedUserId: ADA,
      snapshot: { ...submitted, answers: ['not a report field'] },
      books: [{ slug: book.slug, title: 'not a trusted title' }],
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      snapshot: submitted,
      books: [{ slug: book.slug, title: book.titles['zh-CN'] ?? book.titles.en ?? book.title }],
      deliveryStatus: 'sent',
    });
  });

  test('reports an expired sending lease as retryable without leaking delivery payload', async () => {
    const { app, calls } = build();
    await post(app, { expectedUserId: ADA, snapshot });
    const firstAttemptAt = Date.now() - 1_000;
    db.prepare('UPDATE vocab_test_reports SET deliveryStatus = ? WHERE userId = ?').run(
      'sending',
      ADA,
    );
    db.prepare(
      `INSERT INTO vocab_test_report_deliveries
       (userId, attemptId, state, payloadJson, firstAttemptAt, leaseUntil)
       VALUES (?, ?, 'sending', ?, ?, ?)`,
    ).run(ADA, attemptId, '{"recipient":"hidden@example.test"}', firstAttemptAt, firstAttemptAt);
    const list = await app.request('/');
    expect(await list.json()).toMatchObject({
      reports: [
        {
          snapshot,
          books: [],
          deliveryStatus: 'unknown',
          retryUntil: firstAttemptAt + VOCAB_REPORT_SAFE_RETRY_MS,
        },
      ],
    });
    const duplicate = await post(app, { expectedUserId: ADA, snapshot });
    expect((await duplicate.json()).deliveryStatus).toBe('unknown');
    expect(calls).toEqual([[ADA, attemptId]]);
    const retried = await post(app, { expectedUserId: ADA }, `/${attemptId}/retry`);
    expect((await retried.json()).deliveryStatus).toBe('sent');
    expect(calls).toEqual([
      [ADA, attemptId],
      [ADA, attemptId],
    ]);
  });

  test('holds an ambiguous delivery after the safe retry window and removes its payload', async () => {
    const { app, calls } = build();
    await post(app, { expectedUserId: ADA, snapshot });
    const firstAttemptAt = Date.now() - VOCAB_REPORT_SAFE_RETRY_MS - 1;
    db.prepare('UPDATE vocab_test_reports SET deliveryStatus = ? WHERE userId = ?').run(
      'unknown',
      ADA,
    );
    db.prepare(
      `INSERT INTO vocab_test_report_deliveries
       (userId, attemptId, state, payloadJson, firstAttemptAt)
       VALUES (?, ?, 'unknown', ?, ?)`,
    ).run(ADA, attemptId, '{"to":"hidden@example.test","attachment":"private"}', firstAttemptAt);

    const response = await app.request('/');
    expect(await response.json()).toEqual({
      reports: [{ snapshot, books: [], deliveryStatus: 'held' }],
      nextCursor: null,
    });
    expect(
      db
        .prepare(
          'SELECT state, payloadJson FROM vocab_test_report_deliveries WHERE userId = ? AND attemptId = ?',
        )
        .get(ADA, attemptId),
    ).toEqual({ state: 'held', payloadJson: null });

    const retry = await post(app, { expectedUserId: ADA }, `/${attemptId}/retry`);
    expect((await retry.json()).deliveryStatus).toBe('held');
    expect(calls).toEqual([[ADA, attemptId]]);
  });

  test('a failed saved report can retry and returns the refreshed delivery status', async () => {
    const failed = build({ deliveredStatus: 'failed' });
    const saved = await post(failed.app, { expectedUserId: ADA, snapshot });
    expect(saved.status).toBe(201);
    expect((await saved.json()).deliveryStatus).toBe('failed');

    const retried = build();
    const response = await post(retried.app, { expectedUserId: ADA }, `/${attemptId}/retry`);
    expect(response.status).toBe(200);
    expect((await response.json()).deliveryStatus).toBe('sent');
    expect(retried.calls).toEqual([[ADA, attemptId]]);
  });

  test('paginates stable same-date report history without repeats or cross-account rows', async () => {
    const { app } = build();
    const attempts = Array.from({ length: 32 }, (_, index) => {
      const hex = (index + 1).toString(16).padStart(12, '0');
      return `00000000-0000-4000-8000-${hex}`;
    });
    for (const [index, id] of attempts.entries()) {
      const value = {
        ...snapshot,
        attemptId: id,
      };
      insertVocabReport(ADA, { snapshot: value, books: [] }, 'restored');
      insertVocabReport(
        BOB,
        {
          snapshot: {
            ...value,
            attemptId: `10000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, '0')}`,
          },
          books: [],
        },
        'restored',
      );
    }
    const first = await (await app.request('/')).json();
    expect(first.reports).toHaveLength(30);
    expect(first.nextCursor).toBeTruthy();
    const query = new URLSearchParams({
      beforeTakenAt: first.nextCursor.takenAt,
      beforeAttemptId: first.nextCursor.attemptId,
    });
    const second = await (await app.request(`/?${query.toString()}`)).json();
    expect(second.reports).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    const collected = [...first.reports, ...second.reports];
    expect(
      new Set(
        collected.map((report: { snapshot: VocabReportSnapshot }) => report.snapshot.attemptId),
      ),
    ).toEqual(new Set(attempts));
    expect(
      collected.every(
        (report: { snapshot: VocabReportSnapshot }) => report.snapshot.takenAt === takenAt,
      ),
    ).toBe(true);
  });

  test('rejects partial and malformed cursors', async () => {
    const { app } = build();
    expect((await app.request('/?beforeTakenAt=2026-11-01T00%3A00%3A00.000Z')).status).toBe(400);
    expect((await app.request('/?beforeTakenAt=tomorrow&beforeAttemptId=bad')).status).toBe(400);
  });

  test('requires a verified account using a browser session', async () => {
    const body = { expectedUserId: ADA, snapshot };
    expect((await post(build({ userId: '' }).app, body)).status).toBe(401);
    expect((await post(build({ userId: 'local' }).app, body)).status).toBe(401);
    expect((await post(build({ verified: false }).app, body)).status).toBe(403);
    expect((await post(build({ authRequired: false }).app, body)).status).toBe(404);
    expect((await post(build().app, body, '/', { Authorization: 'Bearer test' })).status).toBe(403);
  });

  test('rejects a reversed interval, non-finite values, and untrusted books', async () => {
    const { app, calls } = build();
    for (const update of [
      { low: 4600 },
      { estimate: Infinity },
      { bookSlugs: ['invented-report-book'] },
      { takenAt: '2026-02-30T00:00:00.000Z' },
    ]) {
      expect(
        (await post(app, { expectedUserId: ADA, snapshot: { ...snapshot, ...update } })).status,
      ).toBe(400);
    }
    expect(
      (await post(app, { expectedUserId: ADA, snapshot, padding: 'x'.repeat(9000) })).status,
    ).toBe(413);
    expect(calls).toEqual([]);
  });

  test('rate limiting blocks new reports and retry sends but existing reads still work', async () => {
    await post(build().app, { expectedUserId: ADA, snapshot });
    const limited = build({ allowWrite: false });
    expect((await post(limited.app, { expectedUserId: ADA, snapshot })).status).toBe(200);
    const otherId = '48421ce8-4a72-4970-9059-42d33c5d0c09';
    expect(
      (
        await post(limited.app, {
          expectedUserId: ADA,
          snapshot: { ...snapshot, attemptId: otherId },
        })
      ).status,
    ).toBe(429);
    db.prepare('UPDATE vocab_test_reports SET deliveryStatus = ? WHERE userId = ?').run(
      'failed',
      ADA,
    );
    expect((await post(limited.app, { expectedUserId: ADA }, `/${attemptId}/retry`)).status).toBe(
      429,
    );
    expect((await limited.app.request('/')).status).toBe(200);
    expect(limited.calls).toEqual([]);
  });
});
