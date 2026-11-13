import { randomUUID } from 'node:crypto';
import { db } from '../db';
import { hashToken } from './crypto';
import { prepareReportEmail, ReportEmailError, sendPreparedReportEmail } from './email';
import {
  VOCAB_REPORT_DELIVERY_LEASE_MS,
  VOCAB_REPORT_SAFE_RETRY_MS,
} from './vocab-test-report-policy';
import { renderVocabReportPdf } from './vocab-test-report-pdf';
import { getVocabReport } from './vocab-test-report-store';
import type { VocabReport, VocabReportLocale } from '../../../languages/en/vocab-report';

const copy: Record<VocabReportLocale, [subject: string, text: string]> = {
  en: ['Your Readfox vocabulary report', 'Your English vocabulary test report is attached.'],
  'zh-CN': ['你的 Readfox 词汇量报告', '附件是你的英语词汇量测试报告。'],
  'zh-TW': ['你的 Readfox 詞彙量報告', '附件是你的英語詞彙量測驗報告。'],
  ja: ['Readfox 語彙力レポート', '英語語彙力テストの結果を添付しました。'],
  ko: ['Readfox 어휘력 보고서', '영어 어휘력 테스트 보고서를 첨부했습니다.'],
  ru: [
    'Ваш отчёт о словарном запасе — Readfox',
    'Во вложении — отчёт о результатах теста на словарный запас английского языка.',
  ],
};

type Outcome = 'sent' | 'failed' | 'unknown' | 'held';

type Delivery = {
  state: 'sending' | Outcome;
  payloadJson: string | null;
  firstAttemptAt: number | null;
  leaseUntil: number | null;
};

type Claim = {
  report: VocabReport;
  leaseId: string;
  recipient: string;
  payload: string | null;
  firstAttemptAt: number | null;
};

type Dependencies = {
  now?: () => number;
  render?: typeof renderVocabReportPdf;
  send?: typeof sendPreparedReportEmail;
  getVerifiedEmail?: (userId: string) => string | undefined;
};

function verifiedEmail(userId: string): string | undefined {
  const account = db
    .query<{ email: string }, [string]>('SELECT email FROM user WHERE id = ? AND emailVerified = 1')
    .get(userId);
  return account?.email;
}

function setReportStatus(userId: string, attemptId: string, state: 'sending' | Outcome): void {
  db.run('UPDATE vocab_test_reports SET deliveryStatus = ? WHERE userId = ? AND attemptId = ?', [
    state,
    userId,
    attemptId,
  ]);
}

function claimDelivery(
  userId: string,
  attemptId: string,
  now: number,
  getVerifiedEmail: (userId: string) => string | undefined,
): Claim | undefined {
  return db
    .transaction(() => {
      const report = getVocabReport(userId, attemptId);
      if (
        !report ||
        report.deliveryStatus === 'sent' ||
        report.deliveryStatus === 'held' ||
        report.deliveryStatus === 'restored'
      )
        return;

      const delivery = db
        .query<
          Delivery,
          [string, string]
        >('SELECT state, payloadJson, firstAttemptAt, leaseUntil FROM vocab_test_report_deliveries WHERE userId = ? AND attemptId = ?')
        .get(userId, attemptId);
      if (delivery?.state === 'sending' && (delivery.leaseUntil ?? 0) > now) return;

      const recipient = getVerifiedEmail(userId);
      const payload = delivery?.payloadJson ?? null;
      const firstAttemptAt = delivery?.firstAttemptAt ?? null;
      const previousRecipient = payload ? (JSON.parse(payload) as { to?: string }).to : undefined;
      const held =
        (payload !== null && previousRecipient !== recipient) ||
        (firstAttemptAt !== null &&
          (now - firstAttemptAt >= VOCAB_REPORT_SAFE_RETRY_MS || !recipient));
      if (held) {
        db.run(
          `UPDATE vocab_test_report_deliveries SET state = 'held', payloadJson = NULL,
         leaseId = NULL, leaseUntil = NULL WHERE userId = ? AND attemptId = ?`,
          [userId, attemptId],
        );
        setReportStatus(userId, attemptId, 'held');
        return;
      }
      if (!recipient) {
        setReportStatus(userId, attemptId, 'failed');
        return;
      }

      const leaseId = randomUUID();
      db.run(
        `INSERT INTO vocab_test_report_deliveries (userId, attemptId, state, leaseId, leaseUntil)
       VALUES (?, ?, 'sending', ?, ?)
       ON CONFLICT (userId, attemptId) DO UPDATE SET
         state = excluded.state, leaseId = excluded.leaseId, leaseUntil = excluded.leaseUntil`,
        [userId, attemptId, leaseId, now + VOCAB_REPORT_DELIVERY_LEASE_MS],
      );
      setReportStatus(userId, attemptId, 'sending');
      return { report, leaseId, recipient, payload, firstAttemptAt };
    })
    .immediate();
}

function finishDelivery(
  userId: string,
  attemptId: string,
  leaseId: string,
  state: Outcome,
  providerId: string | null = null,
): void {
  db.transaction(() => {
    const changed = db.run(
      `UPDATE vocab_test_report_deliveries
       SET state = ?, providerId = ?, leaseId = NULL, leaseUntil = NULL,
           payloadJson = CASE WHEN ? IN ('unknown', 'failed') THEN payloadJson ELSE NULL END,
           firstAttemptAt = CASE WHEN ? = 'failed' THEN NULL ELSE firstAttemptAt END
       WHERE userId = ? AND attemptId = ? AND leaseId = ?`,
      [state, providerId, state, state, userId, attemptId, leaseId],
    );
    if (changed.changes) setReportStatus(userId, attemptId, state);
  }).immediate();
}

export async function deliverVocabReport(
  userId: string,
  attemptId: string,
  {
    now = Date.now,
    render = renderVocabReportPdf,
    send = sendPreparedReportEmail,
    getVerifiedEmail = verifiedEmail,
  }: Dependencies = {},
): Promise<void> {
  const claim = claimDelivery(userId, attemptId, now(), getVerifiedEmail);
  if (!claim) return;

  const { report, recipient, leaseId, firstAttemptAt } = claim;
  let payload = claim.payload;
  if (!payload) {
    try {
      const pdf = await render(report);
      if (!pdf.length) throw new Error('Empty report');
      const [subject, text] = copy[report.snapshot.locale];
      payload = prepareReportEmail({
        to: recipient,
        subject,
        text,
        attachments: [
          { filename: 'readfox-vocabulary-report.pdf', content: pdf.toString('base64') },
        ],
      });
    } catch {
      finishDelivery(userId, attemptId, leaseId, 'failed');
      return;
    }
  }

  if (getVerifiedEmail(userId) !== recipient) {
    finishDelivery(userId, attemptId, leaseId, firstAttemptAt === null ? 'failed' : 'held');
    return;
  }

  const sentAt = now();
  const persisted = db.run(
    `UPDATE vocab_test_report_deliveries
     SET payloadJson = ?, firstAttemptAt = COALESCE(firstAttemptAt, ?), leaseUntil = ?
     WHERE userId = ? AND attemptId = ? AND leaseId = ?`,
    [payload, sentAt, sentAt + VOCAB_REPORT_DELIVERY_LEASE_MS, userId, attemptId, leaseId],
  );
  if (!persisted.changes) return;

  const key = hashToken(JSON.stringify([userId, attemptId]));
  let providerId: string | null;
  try {
    providerId = await send(payload, `vocab-report/${key}`);
  } catch (error) {
    const uncertain = !(error instanceof ReportEmailError) || error.uncertain;
    finishDelivery(userId, attemptId, leaseId, uncertain ? 'unknown' : 'failed');
    return;
  }
  finishDelivery(userId, attemptId, leaseId, 'sent', providerId);
}
