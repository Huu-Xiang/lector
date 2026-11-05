/**
 * Daily review reminder. Every minute it finds users whose local time is
 * within 2 hours after their reminder time and who were not reminded today.
 * It claims the local day with one atomic UPDATE before it calls APNs, so a
 * restart, a slow tick or a second instance cannot send twice.
 */
import { db } from '../db';
import { getApnsSender, type ApnsSender } from './apns';
import { config } from './config';
import { dateStringInTimeZone, getConfiguredTimeZone } from './dates';
import { resolveLanguage } from './active-language';
import { reviewCounts } from './review/counts';
import { Sentry } from './sentry';

const TICK_MS = 60_000;
const WINDOW_MINUTES = 120;

export interface ReminderDeps {
  now: () => Date;
  /** Null when the APNS_* settings are missing: the sweep then does nothing. */
  sender: ApnsSender | null;
  dueCount: (userId: string, at: Date) => number;
}

function defaultDueCount(userId: string, at: Date): number {
  return reviewCounts(userId, resolveLanguage(undefined, userId), at.getTime()).dueNow;
}

interface PrefsRow {
  userId: string;
  reminderTime: string;
  lastSentDate: string | null;
}

interface DeviceRow {
  token: string;
  environment: 'sandbox' | 'production';
  locale: string;
}

function minutesOfDay(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return value('hour') * 60 + value('minute');
}

function reminderMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

const COPY: Record<string, (count: number) => string> = {
  en: (count) => `${count} ${count === 1 ? 'card' : 'cards'} due for review`,
  'zh-CN': (count) => `有 ${count} 张卡片待复习`,
  'zh-TW': (count) => `有 ${count} 張卡片待複習`,
  ja: (count) => `復習するカードが${count}枚あります`,
  ko: (count) => `복습할 카드가 ${count}장 있습니다`,
};

/** The notification text for an interface locale; an unknown locale gets English. */
export function reminderCopy(locale: string, count: number): { title: string; body: string } {
  return { title: 'Readfox', body: (COPY[locale] ?? COPY.en)(count) };
}

/** Claims the user's local day. True for exactly one caller per day. */
function claimDay(userId: string, today: string): boolean {
  const result = db
    .prepare(
      `UPDATE notification_prefs SET lastSentDate = ?
        WHERE userId = ? AND reminderEnabled = 1
          AND (lastSentDate IS NULL OR lastSentDate < ?)`,
    )
    .run(today, userId, today);
  return result.changes === 1;
}

async function remind(userId: string, count: number, sender: ApnsSender): Promise<number> {
  const devices = db
    .prepare('SELECT token, environment, locale FROM push_devices WHERE userId = ?')
    .all(userId) as DeviceRow[];
  let sent = 0;
  for (const device of devices) {
    const { title, body } = reminderCopy(device.locale, count);
    const result = await sender.send({
      token: device.token,
      environment: device.environment,
      title,
      body,
      data: { path: '/practice' },
    });
    if (result === 'sent') sent++;
    if (result === 'unregistered') {
      db.prepare('DELETE FROM push_devices WHERE token = ?').run(device.token);
    }
  }
  return sent;
}

export async function sweepReminders(
  overrides: Partial<ReminderDeps> = {},
): Promise<{ sent: number }> {
  const deps: ReminderDeps = {
    now: () => new Date(),
    sender: null,
    dueCount: defaultDueCount,
    ...overrides,
  };
  if (!deps.sender) return { sent: 0 };

  const at = deps.now();
  const rows = db
    .prepare(
      `SELECT userId, reminderTime, lastSentDate FROM notification_prefs p
        WHERE reminderEnabled = 1
          AND EXISTS (SELECT 1 FROM push_devices d WHERE d.userId = p.userId)`,
    )
    .all() as PrefsRow[];

  let sent = 0;
  for (const row of rows) {
    try {
      const timeZone = getConfiguredTimeZone(row.userId);
      const today = dateStringInTimeZone(at, timeZone);
      const since = minutesOfDay(at, timeZone) - reminderMinutes(row.reminderTime);
      if (since < 0 || since > WINDOW_MINUTES) continue;
      if (row.lastSentDate !== null && row.lastSentDate >= today) continue;
      if (!claimDay(row.userId, today)) continue;
      const count = deps.dueCount(row.userId, at);
      if (count > 0) sent += await remind(row.userId, count, deps.sender);
    } catch (err) {
      Sentry.captureException(err);
      console.error('[reminders] user failed:', err);
    }
  }
  return { sent };
}

let loopTimer: ReturnType<typeof setInterval> | null = null;
let ticking = false;

export function startReminderWorker(
  options: { cloud?: boolean; env?: Record<string, string | undefined> } = {},
): boolean {
  if (!(options.cloud ?? config.authRequired)) return false;
  const sender = getApnsSender(options.env);
  if (!sender) return false;
  if (loopTimer) return true;

  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      const { sent } = await sweepReminders({ sender });
      if (sent > 0) console.log(`[reminders] sent ${sent} notification(s)`);
    } catch (err) {
      Sentry.captureException(err);
      console.error('[reminders] tick failed:', err);
    } finally {
      ticking = false;
    }
  };

  loopTimer = setInterval(tick, TICK_MS);
  loopTimer.unref?.();
  console.log('[reminders] enabled');
  return true;
}

export function stopReminderWorker(): void {
  if (loopTimer) clearInterval(loopTimer);
  loopTimer = null;
}
