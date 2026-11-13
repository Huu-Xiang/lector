import '../test-guard';
import { beforeEach, describe, expect, test } from 'bun:test';
import { db } from '../db';
import { ReportEmailError } from './email';
import type { VocabReportSnapshot } from '../../../languages/en/vocab-report';

const userId = 'vocab-report-delivery-test';
const attemptId = '385e55af-aeed-49e9-a063-442135cdbbc3';
const email = 'vocab-report@example.test';
const snapshot: VocabReportSnapshot = {
  attemptId,
  takenAt: '2026-11-12T02:00:00.000Z',
  locale: 'en',
  estimate: 5000,
  margin: 1000,
  low: 4000,
  high: 6000,
  capped: false,
  level: 'B2',
  bookSlugs: [],
};

function status() {
  return db
    .query('SELECT deliveryStatus FROM vocab_test_reports WHERE userId = ? AND attemptId = ?')
    .get(userId, attemptId) as { deliveryStatus: string };
}

describe('vocabulary report delivery', () => {
  beforeEach(() => {
    db.run('DELETE FROM vocab_test_report_deliveries WHERE userId = ?', [userId]);
    db.run('DELETE FROM vocab_test_reports WHERE userId = ?', [userId]);
    db.run(
      'INSERT INTO vocab_test_reports (userId, attemptId, snapshotJson, booksJson, deliveryStatus) VALUES (?, ?, ?, ?, ?)',
      [userId, attemptId, JSON.stringify(snapshot), '[]', 'pending'],
    );
  });

  test('concurrent calls send one PDF and a sent record does not send again', async () => {
    const { deliverVocabReport } = await import('./vocab-test-report-delivery');
    const sent: string[] = [];
    const dependencies = {
      render: async () => Buffer.from('%PDF-example'),
      send: async (payload: string) => {
        sent.push(payload);
        return 'provider-id';
      },
      getVerifiedEmail: () => email,
    };
    await Promise.all([
      deliverVocabReport(userId, attemptId, dependencies),
      deliverVocabReport(userId, attemptId, dependencies),
    ]);
    await deliverVocabReport(userId, attemptId, dependencies);
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0]!).to).toBe(email);
    expect(JSON.parse(sent[0]!).attachments[0].filename).toEndWith('.pdf');
    expect(status().deliveryStatus).toBe('sent');
  });

  test('reuses the request after an uncertain failure and stops when the window expires', async () => {
    const { deliverVocabReport } = await import('./vocab-test-report-delivery');
    let now = 1_800_000_000_000;
    let renders = 0;
    const attempts: [string, string][] = [];
    const dependencies = {
      now: () => now,
      getVerifiedEmail: () => email,
      render: async () => Buffer.from(`%PDF-${++renders}`),
      send: async (payload: string, key: string) => {
        attempts.push([payload, key]);
        throw new ReportEmailError(true);
      },
    };
    await deliverVocabReport(userId, attemptId, dependencies);
    expect(status().deliveryStatus).toBe('unknown');
    now += 60_000;
    await deliverVocabReport(userId, attemptId, dependencies);
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]!);
    expect(renders).toBe(1);

    now += 24 * 60 * 60 * 1000;
    await deliverVocabReport(userId, attemptId, dependencies);
    expect(attempts).toHaveLength(2);
    expect(status().deliveryStatus).toBe('held');
    expect(
      db.query('SELECT payloadJson FROM vocab_test_report_deliveries WHERE userId = ?').get(userId),
    ).toEqual({ payloadJson: null });
  });

  test('sends Russian email copy with the Russian PDF attached', async () => {
    const { deliverVocabReport } = await import('./vocab-test-report-delivery');
    db.run('UPDATE vocab_test_reports SET snapshotJson = ? WHERE userId = ? AND attemptId = ?', [
      JSON.stringify({ ...snapshot, locale: 'ru' }),
      userId,
      attemptId,
    ]);
    const sent: string[] = [];
    await deliverVocabReport(userId, attemptId, {
      getVerifiedEmail: () => email,
      send: async (payload) => {
        sent.push(payload);
        return 'provider-id';
      },
    });

    expect(status().deliveryStatus).toBe('sent');
    expect(sent).toHaveLength(1);
    const message = JSON.parse(sent[0]!);
    expect(message.subject).toBe('Ваш отчёт о словарном запасе — Readfox');
    expect(message.text).toContain('Во вложении');
    expect(message.attachments).toHaveLength(1);
    expect(message.attachments[0].filename).toBe('readfox-vocabulary-report.pdf');
    expect(Buffer.from(message.attachments[0].content, 'base64').subarray(0, 5).toString()).toBe(
      '%PDF-',
    );
  });

  test('does not send a failed report to a different verified address', async () => {
    const { deliverVocabReport } = await import('./vocab-test-report-delivery');
    let recipient = email;
    let calls = 0;
    const dependencies = {
      getVerifiedEmail: () => recipient,
      render: async () => Buffer.from('%PDF-example'),
      send: async () => {
        calls++;
        throw new ReportEmailError(false);
      },
    };
    await deliverVocabReport(userId, attemptId, dependencies);
    expect(status().deliveryStatus).toBe('failed');
    recipient = 'different@example.test';
    await deliverVocabReport(userId, attemptId, {
      ...dependencies,
      send: async () => {
        calls++;
        return null;
      },
    });
    expect(status().deliveryStatus).toBe('held');
    expect(calls).toBe(1);
  });

  test('a definitive rejection after an unknown attempt becomes retryable', async () => {
    const { deliverVocabReport } = await import('./vocab-test-report-delivery');
    let now = 1_800_000_000_000;
    const attempts: [string, string][] = [];
    const dependencies = {
      now: () => now,
      getVerifiedEmail: () => email,
      render: async () => Buffer.from('%PDF-example'),
      send: async (payload: string, key: string) => {
        attempts.push([payload, key]);
        throw new ReportEmailError(true);
      },
    };
    await deliverVocabReport(userId, attemptId, dependencies);
    expect(status().deliveryStatus).toBe('unknown');
    now += 60_001;
    await deliverVocabReport(userId, attemptId, {
      ...dependencies,
      send: async (payload: string, key: string) => {
        attempts.push([payload, key]);
        throw new ReportEmailError(false);
      },
    });
    expect(status().deliveryStatus).toBe('failed');
    expect(attempts[1]).toEqual(attempts[0]);
  });

  test('a render failure leaves the record retryable without sending an empty attachment', async () => {
    const { deliverVocabReport } = await import('./vocab-test-report-delivery');
    let calls = 0;
    const send = async () => {
      calls++;
      return 'provider-id';
    };
    await deliverVocabReport(userId, attemptId, {
      render: async () => {
        throw new Error('Font unavailable');
      },
      getVerifiedEmail: () => email,
      send,
    });
    expect(status().deliveryStatus).toBe('failed');
    expect(calls).toBe(0);
    await deliverVocabReport(userId, attemptId, {
      render: async () => Buffer.from('%PDF-example'),
      getVerifiedEmail: () => email,
      send,
    });
    expect(status().deliveryStatus).toBe('sent');
    expect(calls).toBe(1);
  });
});
