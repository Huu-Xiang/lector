import { randomUUID } from 'crypto';
import { db } from '../db';
import { sendEmail, type EmailAttachment } from './email';
import { parseAdminEmails } from './admin';

export const MAX_MESSAGE_CHARS = 5000;
export const MAX_IMAGES = 3;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const PER_HOUR_LIMIT = 5;
export const PER_DAY_LIMIT = 20;
export const SITE_DAY_LIMIT = 200;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export type ImageKind = 'png' | 'jpeg' | 'webp' | 'gif';

const MIME_BY_KIND: Record<ImageKind, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

export function isAllowedImageMime(mime: string): boolean {
  return Object.values(MIME_BY_KIND).includes(mime);
}

export function detectImageKind(bytes: Uint8Array): ImageKind | null {
  const startsWith = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith([0xff, 0xd8, 0xff])) return 'jpeg';
  if (
    startsWith([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    startsWith([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  )
    return 'gif';
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8))
    return 'webp';
  return null;
}

export function extensionFor(kind: ImageKind): string {
  return kind === 'jpeg' ? 'jpg' : kind;
}

export function feedbackRecipient(env: NodeJS.ProcessEnv = process.env): string | null {
  const direct = env.FEEDBACK_EMAIL?.trim();
  if (direct) return direct;
  return [...parseAdminEmails(env.LECTOR_ADMIN_EMAILS)][0] ?? null;
}

export type RateVerdict = 'ok' | 'user_hour' | 'user_day' | 'site_day';

export function checkFeedbackRate(userId: string, now: number): RateVerdict {
  const count = (sql: string, ...args: (string | number)[]) =>
    (db.prepare(sql).get(...args) as { n: number }).n;
  const since = (ms: number) => new Date(now - ms).toISOString();
  if (
    count(
      'SELECT COUNT(*) AS n FROM feedback_messages WHERE userId = ? AND createdAt >= ?',
      userId,
      since(HOUR_MS),
    ) >= PER_HOUR_LIMIT
  )
    return 'user_hour';
  if (
    count(
      'SELECT COUNT(*) AS n FROM feedback_messages WHERE userId = ? AND createdAt >= ?',
      userId,
      since(DAY_MS),
    ) >= PER_DAY_LIMIT
  )
    return 'user_day';
  if (
    count('SELECT COUNT(*) AS n FROM feedback_messages WHERE createdAt >= ?', since(DAY_MS)) >=
    SITE_DAY_LIMIT
  )
    return 'site_day';
  return 'ok';
}

export interface FeedbackInput {
  userId: string;
  email: string | null;
  plan: string;
  locale: string;
  userAgent: string;
  text: string;
  attachments: EmailAttachment[];
  now: Date;
}

let warnedNoRecipient = false;

/** Stores the message, then emails it. Returns false when the email failed. */
export async function submitFeedback(input: FeedbackInput): Promise<boolean> {
  const id = randomUUID();
  db.prepare(
    'INSERT INTO feedback_messages (id, userId, createdAt, text, imageCount, emailed) VALUES (?, ?, ?, ?, ?, 0)',
  ).run(id, input.userId, input.now.toISOString(), input.text, input.attachments.length);

  const to = feedbackRecipient();
  if (!to) {
    if (!warnedNoRecipient) {
      warnedNoRecipient = true;
      console.warn('[feedback] FEEDBACK_EMAIL and LECTOR_ADMIN_EMAILS are unset; no mail is sent');
    }
    return true;
  }

  const subjectText = input.text.replace(/\s+/g, ' ').trim().slice(0, 60);
  const body = [
    input.text,
    '',
    '---',
    `User id: ${input.userId}`,
    `Account email: ${input.email ?? '(none)'}`,
    `Plan: ${input.plan}`,
    `Interface locale: ${input.locale || '(unknown)'}`,
    `User agent: ${input.userAgent || '(unknown)'}`,
    `Time: ${input.now.toISOString()}`,
    `Images: ${input.attachments.length}`,
  ].join('\n');

  try {
    await sendEmail({
      to,
      subject: `[Readfox feedback] ${subjectText}`,
      text: body,
      ...(input.email ? { replyTo: input.email } : {}),
      ...(input.attachments.length ? { attachments: input.attachments } : {}),
    });
  } catch (err) {
    console.error('[feedback] email failed', err);
    return false;
  }
  db.prepare('UPDATE feedback_messages SET emailed = 1 WHERE id = ?').run(id);
  return true;
}
