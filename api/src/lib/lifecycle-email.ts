/**
 * Cloud lifecycle mail (#558). Sends published Resend templates. Each user
 * gets each template once, except the two with a send key (plan ending, review
 * due). Self-host skips this module. A transport error
 * must not fail the flow that triggered the send.
 */
import { Database } from 'bun:sqlite';
import { db } from '../db';
import { config } from './config';
import { sendEmail, type EmailMessage } from './email';
import { productEmailsEnabled } from './app-settings';
import { renderLifecycleEmail, type LifecycleVars } from './lifecycle-copy';
import { isUnsubscribed, listUnsubscribeHeaders, unsubscribeUrl } from './email-unsubscribe';
import { LANGUAGES, isValidLanguageCode, type LanguageCode } from './languages';
import { Sentry } from './sentry';
import { hasStarterContent } from './starter-content';
import { listLibraryBooks } from './library-content';
import { isEntitledStatus } from './billing';
import { addDaysToDateString, dateStringInTimeZone, isValidTimeZone } from './dates';
import { planName } from './plan-names';
import { getCounts } from './review/queue';
import { backfillWordCards } from './review/backfill';
import { reconcileWordCards } from './review/reconcile';
import { goalStreakSince, readDailyGoal, type DailyGoal } from './daily-goal';
import { computeStreaks, goalDateSet, type DailyActivityRow } from './streak';

export const LIFECYCLE_TEMPLATES = {
  welcome: 'welcome-on-account-create',
  day1: 'day-1-registered-no-word-saved',
  day3: 'day-3-registered-no-real-use',
  anki: 'anki-after-10-saved-words',
  glossCap: 'gloss-cap-free-tier-limit-hit',
  planEnding: 'plan-ending-3d',
  reviewDue: 'review-due',
  streakRisk: 'streak-at-risk',
} as const;

export type LifecycleAlias = (typeof LIFECYCLE_TEMPLATES)[keyof typeof LIFECYCLE_TEMPLATES];

export const ANKI_WORD_THRESHOLD = 10;
const HOUR_MS = 60 * 60 * 1000;
/** Day-1 is only for accounts that just crossed 24 hours. */
export const DAY1_AFTER_MS = 24 * HOUR_MS;
export const DAY1_UNTIL_MS = 72 * HOUR_MS;
/** Day-3 is only for accounts that just crossed 72 hours. */
export const DAY3_AFTER_MS = 72 * HOUR_MS;
export const DAY3_UNTIL_MS = 7 * 24 * HOUR_MS;
/** Plan-ending mail goes to a grant that ends inside this window. */
export const PLAN_ENDING_WINDOW_MS = 72 * HOUR_MS;
export const REVIEW_DUE_MIN_WORDS = 5;
export const REVIEW_DUE_GAP_MS = 3 * 24 * HOUR_MS;
/** Review-due mail stops after this many sends with no activity since. */
export const REVIEW_DUE_MAX_UNANSWERED = 3;
export const REVIEW_DUE_ACTIVE_DAYS = 30;
/** Earliest local hour for review-due mail, so the sweep does not mail at midnight. */
export const REVIEW_DUE_FROM_HOUR = 17;
/** One review-due sweep sends at most this many mails. */
export const REVIEW_DUE_MAX_MAILS_PER_SWEEP = 200;
/** The review-due loop gives the event loop a turn after this many users. */
export const REVIEW_DUE_YIELD_EVERY = 25;
/** A failed send of one template to one user is not tried again inside this time. */
export const SEND_RETRY_BACKOFF_MS = 6 * HOUR_MS;

const UNSUBSCRIBE_ALIASES = new Set<LifecycleAlias>([
  LIFECYCLE_TEMPLATES.welcome,
  LIFECYCLE_TEMPLATES.day1,
  LIFECYCLE_TEMPLATES.day3,
  LIFECYCLE_TEMPLATES.anki,
  LIFECYCLE_TEMPLATES.glossCap,
  LIFECYCLE_TEMPLATES.planEnding,
  LIFECYCLE_TEMPLATES.reviewDue,
  LIFECYCLE_TEMPLATES.streakRisk,
]);

const REAL_USE_EVENTS = [
  'lesson.opened',
  'vocab.saved',
  'practice.answer_submitted',
  'onboarding.completed',
] as const;

export type LifecycleSendResult = 'sent' | 'skipped';

export interface LifecycleUser {
  id: string;
  email: string;
  name: string | null;
  emailVerified: number | boolean;
  createdAt: string | number;
}

export interface LifecycleDeps {
  database: Database;
  now: () => Date;
  send: (message: EmailMessage) => Promise<void>;
  cloud: boolean;
  hasResendKey: boolean;
  /** The admin switch for lifecycle mail (lib/app-settings.ts). */
  enabled: boolean;
  appUrl: string;
  /** Words in the review round now (due plus new). Replaced in tests. */
  reviewCount: (userId: string, language: string, nowMs: number) => number;
}

export function defaultLifecycleDeps(): LifecycleDeps {
  return {
    database: db,
    now: () => new Date(),
    send: sendEmail,
    cloud: config.authRequired,
    hasResendKey: Boolean(process.env.RESEND_API_KEY),
    enabled: productEmailsEnabled(),
    appUrl: process.env.BETTER_AUTH_URL || process.env.APP_URL || 'https://readfox.app',
    reviewCount: reviewWordCount,
  };
}

/** The review page's count (routes/review.ts): cards are filled in first, so a legacy word counts. */
export function reviewWordCount(userId: string, language: string, nowMs: number): number {
  backfillWordCards(userId, language, nowMs);
  reconcileWordCards(userId, language, nowMs);
  const counts = getCounts(userId, language, nowMs);
  return counts.dueNow + counts.newAvailable;
}

function mergeDeps(overrides?: Partial<LifecycleDeps>): LifecycleDeps {
  return { ...defaultLifecycleDeps(), ...overrides };
}

function userTableExists(database: Database): boolean {
  return Boolean(
    database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user'").get(),
  );
}

function isVerified(value: number | boolean): boolean {
  return value === 1 || value === true;
}

/** Parse Better Auth `createdAt` (ISO, Date, ms, or unix seconds). Null if unknown. */
export function createdAtMs(value: unknown): number | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e11 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      const asNumber = Number(trimmed);
      if (!Number.isFinite(asNumber)) return null;
      return asNumber < 1e11 ? asNumber * 1000 : asNumber;
    }
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/** The user's target language code, or null when it is unset or unknown. */
export function languageCodeFor(database: Database, userId: string): LanguageCode | null {
  const row = database
    .prepare('SELECT value FROM settings WHERE userId = ? AND key = ?')
    .get(userId, 'targetLanguage') as { value: string } | undefined;
  if (!row) return null;
  const raw = row.value.replace(/^"|"$/g, '');
  return isValidLanguageCode(raw) ? raw : null;
}

export function languageLabel(database: Database, userId: string): string {
  const code = languageCodeFor(database, userId);
  return code ? LANGUAGES[code].name : 'your language';
}

/**
 * One sentence about what the reader can open first. Empty when no language is set;
 * the mail then leaves the paragraph out.
 */
export function starterLine(database: Database, userId: string): string {
  const code = languageCodeFor(database, userId);
  if (!code) return '';
  const name = LANGUAGES[code].name;
  if (hasStarterContent(code)) {
    return `Your first ${name} lessons are already in your library, graded from the most common words up.`;
  }
  const books = listLibraryBooks(code).length;
  if (books > 0) {
    return `Readfox has ${books} free ${name} books, sorted by level. You can start one without importing anything.`;
  }
  return `To start, paste an article or import a book in ${name} that you want to read.`;
}

/** `email_sends.templateAlias` holds the send key: the alias, or `<alias>:<suffix>` for a repeatable mail. */
function alreadySent(database: Database, userId: string, sendKey: string): boolean {
  return Boolean(
    database
      .prepare('SELECT 1 FROM email_sends WHERE userId = ? AND templateAlias = ?')
      .get(userId, sendKey),
  );
}

function isSuspendedAccount(database: Database, userId: string): boolean {
  const row = database
    .prepare('SELECT suspended FROM admin_account_flags WHERE userId = ?')
    .get(userId) as { suspended: number } | undefined;
  return row?.suspended === 1;
}

const SUSPENDED_FILTER = `NOT EXISTS (
  SELECT 1 FROM admin_account_flags f WHERE f.userId = u.id AND f.suspended = 1)`;

/** Failed sends, by database, then `<userId>|<alias>`. Lost on restart, which only allows one early retry. */
const failedSends = new WeakMap<Database, Map<string, number>>();

function failureKey(userId: string, alias: LifecycleAlias): string {
  return `${userId}|${alias}`;
}

function recordFailedSend(deps: LifecycleDeps, userId: string, alias: LifecycleAlias): void {
  const failures = failedSends.get(deps.database) ?? new Map<string, number>();
  failures.set(failureKey(userId, alias), deps.now().getTime());
  failedSends.set(deps.database, failures);
}

function inBackoff(deps: LifecycleDeps, userId: string, alias: LifecycleAlias): boolean {
  const failures = failedSends.get(deps.database);
  const failedAt = failures?.get(failureKey(userId, alias));
  if (failedAt === undefined) return false;
  if (deps.now().getTime() - failedAt < SEND_RETRY_BACKOFF_MS) return true;
  failures?.delete(failureKey(userId, alias));
  return false;
}

/** Insert the send row. Returns false when this user already has the key. */
function claimSend(database: Database, userId: string, sendKey: string, sentAt: string): boolean {
  const result = database
    .prepare('INSERT OR IGNORE INTO email_sends (userId, templateAlias, sentAt) VALUES (?, ?, ?)')
    .run(userId, sendKey, sentAt);
  return result.changes > 0;
}

function releaseSend(database: Database, userId: string, sendKey: string): void {
  database
    .prepare('DELETE FROM email_sends WHERE userId = ? AND templateAlias = ?')
    .run(userId, sendKey);
}

function loadUser(database: Database, userId: string): LifecycleUser | null {
  if (!userTableExists(database)) return null;
  return (
    (database
      .prepare('SELECT id, email, name, emailVerified, createdAt FROM user WHERE id = ?')
      .get(userId) as LifecycleUser | undefined) ?? null
  );
}

function loadVerifiedUsers(database: Database): LifecycleUser[] {
  if (!userTableExists(database)) return [];
  return database
    .prepare(
      `SELECT u.id, u.email, u.name, u.emailVerified, u.createdAt FROM user u
        WHERE u.emailVerified = 1 AND ${SUSPENDED_FILTER}`,
    )
    .all() as LifecycleUser[];
}

export function savedWordCount(database: Database, userId: string): number {
  return (
    database
      .prepare("SELECT COUNT(*) AS c FROM vocab WHERE userId = ? AND state != 'ignored'")
      .get(userId) as { c: number }
  ).c;
}

export function hasRealUse(database: Database, userId: string): boolean {
  if (savedWordCount(database, userId) > 0) return true;
  const placeholders = REAL_USE_EVENTS.map(() => '?').join(',');
  const event = database
    .prepare(
      `SELECT 1 AS ok FROM learner_events WHERE userId = ? AND eventType IN (${placeholders}) LIMIT 1`,
    )
    .get(userId, ...REAL_USE_EVENTS) as { ok: number } | undefined;
  if (event) return true;
  const read = database
    .prepare(
      `SELECT 1 AS ok FROM lessons
        WHERE userId = ? AND (progress_percentComplete > 0 OR progress_scrollPosition > 0)
        LIMIT 1`,
    )
    .get(userId) as { ok: number } | undefined;
  return Boolean(read);
}

interface SendOptions {
  /** Dedupe key, `<alias>:<suffix>`. Lets one template go out again; the rendered template stays the alias. */
  key?: string;
  vars?: Partial<LifecycleVars>;
  /** Sweeps set this so a failed send waits SEND_RETRY_BACKOFF_MS before the next try. */
  backoff?: boolean;
}

async function sendOnce(
  user: LifecycleUser,
  alias: LifecycleAlias,
  deps: LifecycleDeps,
  options: SendOptions = {},
): Promise<LifecycleSendResult> {
  const sendKey = options.key ?? alias;
  if (!deps.cloud || !deps.hasResendKey || !deps.enabled) return 'skipped';
  if (!isVerified(user.emailVerified) || !user.email) return 'skipped';
  if (alreadySent(deps.database, user.id, sendKey)) return 'skipped';
  if (isUnsubscribed(deps.database, user.email)) return 'skipped';
  if (isSuspendedAccount(deps.database, user.id)) return 'skipped';
  if (options.backoff && inBackoff(deps, user.id, alias)) return 'skipped';

  const sentAt = deps.now().toISOString();
  if (!claimSend(deps.database, user.id, sendKey, sentAt)) return 'skipped';

  const stopUrl = unsubscribeUrl(deps.appUrl, user.email);
  const wantsStop = UNSUBSCRIBE_ALIASES.has(alias);

  try {
    const vars = {
      USER_NAME: user.name?.trim() || 'there',
      LANGUAGE: languageLabel(deps.database, user.id),
      APP_URL: deps.appUrl,
      STOP_URL: stopUrl || `${deps.appUrl.replace(/\/$/, '')}/api/email/unsubscribe`,
      STARTER_LINE: starterLine(deps.database, user.id),
      WORD_COUNT: String(savedWordCount(deps.database, user.id)),
      PLAN_NAME: '',
      END_DATE: '',
      REVIEW_COUNT: '',
      STREAK_DAYS: '',
      GOAL_EN: '',
      GOAL_ZH: '',
      ...options.vars,
    };
    // Inline copy; Resend hosted templates were never published (404).
    const rendered = renderLifecycleEmail(alias, vars);
    await deps.send({
      to: user.email,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      meta: { alias, variables: vars },
      headers: wantsStop && stopUrl ? listUnsubscribeHeaders(stopUrl) : undefined,
    });
    return 'sent';
  } catch (err) {
    releaseSend(deps.database, user.id, sendKey);
    recordFailedSend(deps, user.id, alias);
    console.error(`[lifecycle-email] failed to send ${sendKey} to ${user.email}:`, err);
    Sentry.captureException(err);
    return 'skipped';
  }
}

/**
 * Welcome is hook-only. The sweep does not send it. If the app is not
 * cloud, or RESEND_API_KEY is absent, sendOnce returns skipped and writes
 * no email_sends row. That send does not retry later. That is a decision,
 * not a gap.
 */
export async function sendWelcomeEmail(
  userId: string,
  overrides?: Partial<LifecycleDeps>,
): Promise<LifecycleSendResult> {
  try {
    const deps = mergeDeps(overrides);
    const user = loadUser(deps.database, userId);
    if (!user) return 'skipped';
    return await sendOnce(user, LIFECYCLE_TEMPLATES.welcome, deps);
  } catch (err) {
    console.error(`[lifecycle-email] welcome failed for ${userId}:`, err);
    Sentry.captureException(err);
    return 'skipped';
  }
}

export async function notifyVocabSaved(
  userId: string,
  overrides?: Partial<LifecycleDeps>,
): Promise<LifecycleSendResult> {
  try {
    const deps = mergeDeps(overrides);
    if (savedWordCount(deps.database, userId) < ANKI_WORD_THRESHOLD) return 'skipped';
    const user = loadUser(deps.database, userId);
    if (!user) return 'skipped';
    return await sendOnce(user, LIFECYCLE_TEMPLATES.anki, deps);
  } catch (err) {
    console.error(`[lifecycle-email] anki notify failed for ${userId}:`, err);
    Sentry.captureException(err);
    return 'skipped';
  }
}

export async function notifyGlossCapHit(
  userId: string,
  overrides?: Partial<LifecycleDeps>,
): Promise<LifecycleSendResult> {
  try {
    const deps = mergeDeps(overrides);
    const user = loadUser(deps.database, userId);
    if (!user) return 'skipped';
    return await sendOnce(user, LIFECYCLE_TEMPLATES.glossCap, deps);
  } catch (err) {
    console.error(`[lifecycle-email] gloss-cap notify failed for ${userId}:`, err);
    Sentry.captureException(err);
    return 'skipped';
  }
}

/** Runs `work` for each item. One item that throws is logged and does not stop the rest. */
async function eachUser<T>(
  label: string,
  items: T[],
  userIdOf: (item: T) => string,
  work: (item: T) => Promise<LifecycleSendResult[]>,
): Promise<LifecycleSendResult[]> {
  const results: LifecycleSendResult[] = [];
  for (const item of items) {
    try {
      results.push(...(await work(item)));
    } catch (err) {
      console.error(`[lifecycle-email] ${label} failed for ${userIdOf(item)}:`, err);
      Sentry.captureException(err);
    }
  }
  return results;
}

/** Day-1 and day-3 product mail. Welcome is hook-only, so account age bounds both. */
async function sweepNewAccounts(deps: LifecycleDeps): Promise<LifecycleSendResult[]> {
  const nowMs = deps.now().getTime();
  return eachUser(
    'new-account mail',
    loadVerifiedUsers(deps.database),
    (user) => user.id,
    async (user) => {
      const createdMs = createdAtMs(user.createdAt);
      if (createdMs == null) return [];
      const ageMs = nowMs - createdMs;
      if (ageMs < 0 || ageMs >= DAY3_UNTIL_MS) return [];
      const results: LifecycleSendResult[] = [];
      if (
        ageMs >= DAY1_AFTER_MS &&
        ageMs < DAY1_UNTIL_MS &&
        savedWordCount(deps.database, user.id) === 0
      ) {
        results.push(await sendOnce(user, LIFECYCLE_TEMPLATES.day1, deps, { backoff: true }));
      }
      if (ageMs >= DAY3_AFTER_MS && ageMs < DAY3_UNTIL_MS && !hasRealUse(deps.database, user.id)) {
        results.push(await sendOnce(user, LIFECYCLE_TEMPLATES.day3, deps, { backoff: true }));
      }
      return results;
    },
  );
}

export async function sweepLifecycleEmails(
  overrides?: Partial<LifecycleDeps>,
): Promise<{ sent: number; skipped: number }> {
  try {
    const deps = mergeDeps(overrides);
    let sent = 0;
    let skipped = 0;
    if (!deps.cloud || !deps.hasResendKey || !deps.enabled) return { sent, skipped };

    // Each loop fails on its own.
    for (const loop of [sweepNewAccounts, sweepPlanEnding, sweepStreakRisk, sweepReviewDue]) {
      try {
        for (const result of await loop(deps)) {
          if (result === 'sent') sent += 1;
          else skipped += 1;
        }
      } catch (err) {
        console.error(`[lifecycle-email] ${loop.name} failed:`, err);
        Sentry.captureException(err);
      }
    }
    return { sent, skipped };
  } catch (err) {
    console.error('[lifecycle-email] sweep failed:', err);
    Sentry.captureException(err);
    return { sent: 0, skipped: 0 };
  }
}

/** The user's valid `timezone` setting, or null when none is stored. */
function storedTimeZone(database: Database, userId: string): string | null {
  const row = database
    .prepare('SELECT value FROM settings WHERE userId = ? AND key = ?')
    .get(userId, 'timezone') as { value: string } | undefined;
  if (!row) return null;
  let value: unknown = row.value;
  try {
    value = JSON.parse(row.value);
  } catch {
    // legacy raw-string value
  }
  return typeof value === 'string' && isValidTimeZone(value) ? value : null;
}

function localHour(date: Date, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(date),
  );
}

function hasEntitledSubscription(database: Database, user: LifecycleUser): boolean {
  const rows = database
    .prepare(
      `SELECT s.status FROM billing_subscriptions s
         LEFT JOIN billing_customers c ON c.paddleCustomerId = s.paddleCustomerId
        WHERE s.userId = ? OR c.email = lower(?)`,
    )
    .all(user.id, user.email) as Array<{ status: string }>;
  return rows.some((row) => isEntitledStatus(row.status));
}

function isComped(database: Database, userId: string): boolean {
  const row = database
    .prepare('SELECT compedPlan FROM admin_account_flags WHERE userId = ?')
    .get(userId) as { compedPlan: string | null } | undefined;
  return Boolean(row?.compedPlan);
}

/** One mail per user whose latest grant ends in the next 72 hours with no Paddle subscription behind it. */
async function sweepPlanEnding(deps: LifecycleDeps): Promise<LifecycleSendResult[]> {
  const now = deps.now();
  const nowIso = now.toISOString();
  const untilIso = new Date(now.getTime() + PLAN_ENDING_WINDOW_MS).toISOString();
  const grants = deps.database
    .prepare(
      `SELECT g.id, g.userId, g.plan, g.endsAt FROM plan_grants g
        WHERE g.endsAt > ?1 AND g.endsAt <= ?2 AND g.startsAt <= ?1
          AND g.plan IN ('cloud', 'plus', 'max')
          AND NOT EXISTS (SELECT 1 FROM plan_grants h WHERE h.userId = g.userId AND h.endsAt > g.endsAt)
        ORDER BY g.userId, g.endsAt DESC`,
    )
    .all(nowIso, untilIso) as Array<{ id: string; userId: string; plan: string; endsAt: string }>;

  const seen = new Set<string>();
  const latest = grants.filter((grant) => {
    if (seen.has(grant.userId)) return false;
    seen.add(grant.userId);
    return true;
  });
  return eachUser(
    'plan-ending mail',
    latest,
    (grant) => grant.userId,
    async (grant) => {
      const user = loadUser(deps.database, grant.userId);
      if (!user || !isVerified(user.emailVerified)) return [];
      if (hasEntitledSubscription(deps.database, user) || isComped(deps.database, user.id)) {
        return [];
      }
      const endDate = new Intl.DateTimeFormat('en-GB', {
        timeZone: storedTimeZone(deps.database, user.id) ?? undefined,
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date(grant.endsAt));
      return [
        await sendOnce(user, LIFECYCLE_TEMPLATES.planEnding, deps, {
          key: `${LIFECYCLE_TEMPLATES.planEnding}:${grant.id}`,
          vars: { PLAN_NAME: planName(grant.plan), END_DATE: endDate },
          backoff: true,
        }),
      ];
    },
  );
}

const ACTIVE_DAY = `(wordsRead > 0 OR newWordsSaved > 0 OR minutesRead > 0
  OR clozePracticed > 0 OR dictionaryLookups > 0 OR ankiReviews > 0)`;

/** True when this user was active on or after `fromDate` (YYYY-MM-DD, the user's day). */
function activeSince(database: Database, userId: string, fromDate: string): boolean {
  return Boolean(
    database
      .prepare(`SELECT 1 FROM dailyStats WHERE userId = ? AND date >= ? AND ${ACTIVE_DAY} LIMIT 1`)
      .get(userId, fromDate),
  );
}

/** True after a review or a lookup on `date`. */
function reviewedOrLookedUp(database: Database, userId: string, date: string): boolean {
  return Boolean(
    database
      .prepare(
        `SELECT 1 FROM dailyStats
          WHERE userId = ? AND date = ? AND (clozePracticed > 0 OR dictionaryLookups > 0) LIMIT 1`,
      )
      .get(userId, date),
  );
}

/** Review-due sends since the last active day. A key holds the user's day of its send. */
function unansweredReviewMails(database: Database, userId: string): number {
  const last = database
    .prepare(`SELECT MAX(date) AS date FROM dailyStats WHERE userId = ? AND ${ACTIVE_DAY}`)
    .get(userId) as { date: string | null };
  const keys = database
    .prepare(
      `SELECT templateAlias FROM email_sends
        WHERE userId = ? AND templateAlias >= ? AND templateAlias < ?
        ORDER BY templateAlias DESC LIMIT ?`,
    )
    .all(
      userId,
      `${LIFECYCLE_TEMPLATES.reviewDue}:`,
      `${LIFECYCLE_TEMPLATES.reviewDue};`,
      REVIEW_DUE_MAX_UNANSWERED,
    ) as Array<{ templateAlias: string }>;
  const sentDay = (key: string) => key.slice(LIFECYCLE_TEMPLATES.reviewDue.length + 1);
  return keys.filter((row) => !last.date || sentDay(row.templateAlias) >= last.date).length;
}

/** Review-due mail: the rules are the REVIEW_DUE_* constants; sends only in the evening of the user's stored zone. */
async function sweepReviewDue(deps: LifecycleDeps): Promise<LifecycleSendResult[]> {
  const now = deps.now();
  const nowMs = now.getTime();
  const gapIso = new Date(nowMs - REVIEW_DUE_GAP_MS).toISOString();
  const wideFrom = addDaysToDateString(
    now.toISOString().slice(0, 10),
    -(REVIEW_DUE_ACTIVE_DAYS + 1),
  );
  if (!userTableExists(deps.database)) return [];
  // Cheap SQL first: the per-user checks below only run for these candidates.
  const candidates = deps.database
    .prepare(
      `SELECT u.id, u.email, u.name, u.emailVerified, u.createdAt FROM user u
        WHERE u.emailVerified = 1
          AND ${SUSPENDED_FILTER}
          AND EXISTS (SELECT 1 FROM dailyStats d WHERE d.userId = u.id AND d.date >= ?)
          AND NOT EXISTS (
            SELECT 1 FROM email_sends e
             WHERE e.userId = u.id AND e.templateAlias >= ? AND e.templateAlias < ? AND e.sentAt > ?)`,
    )
    .all(
      wideFrom,
      `${LIFECYCLE_TEMPLATES.reviewDue}:`,
      `${LIFECYCLE_TEMPLATES.reviewDue};`,
      gapIso,
    ) as LifecycleUser[];

  const results: LifecycleSendResult[] = [];
  let visited = 0;
  let mails = 0;
  for (const user of candidates) {
    if (mails >= REVIEW_DUE_MAX_MAILS_PER_SWEEP) break;
    if (visited > 0 && visited % REVIEW_DUE_YIELD_EVERY === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    visited += 1;
    try {
      const result = await reviewDueFor(user, deps, now);
      if (!result) continue;
      results.push(result);
      if (result === 'sent') mails += 1;
    } catch (err) {
      console.error(`[lifecycle-email] review-due mail failed for ${user.id}:`, err);
      Sentry.captureException(err);
    }
  }
  return results;
}

async function reviewDueFor(
  user: LifecycleUser,
  deps: LifecycleDeps,
  now: Date,
): Promise<LifecycleSendResult | null> {
  if (!user.email || isUnsubscribed(deps.database, user.email)) return null;
  // Without a stored zone the local hour is unknown, and the mail could land at night.
  const zone = storedTimeZone(deps.database, user.id);
  if (!zone) return null;
  if (localHour(now, zone) < REVIEW_DUE_FROM_HOUR) return null;
  if (inBackoff(deps, user.id, LIFECYCLE_TEMPLATES.reviewDue)) return null;
  const today = dateStringInTimeZone(now, zone);
  if (reviewedOrLookedUp(deps.database, user.id, today)) return null;
  if (alreadySent(deps.database, user.id, `${LIFECYCLE_TEMPLATES.streakRisk}:${today}`)) {
    return null;
  }
  if (!activeSince(deps.database, user.id, addDaysToDateString(today, -REVIEW_DUE_ACTIVE_DAYS))) {
    return null;
  }
  if (unansweredReviewMails(deps.database, user.id) >= REVIEW_DUE_MAX_UNANSWERED) return null;
  const language = languageCodeFor(deps.database, user.id);
  if (!language) return null;
  const words = deps.reviewCount(user.id, language, now.getTime());
  if (words < REVIEW_DUE_MIN_WORDS) return null;
  return sendOnce(user, LIFECYCLE_TEMPLATES.reviewDue, deps, {
    key: `${LIFECYCLE_TEMPLATES.reviewDue}:${today}`,
    vars: { REVIEW_COUNT: String(words) },
    backoff: true,
  });
}

/** Streak reminder: a streak of at least this many days, with today's goal not met yet. */
export const STREAK_RISK_MIN_DAYS = 2;
/** Sent from this local hour, so a reader still has the evening to keep the streak. */
export const STREAK_RISK_FROM_HOUR = 19;

function goalWords(goal: DailyGoal): { en: string; zh: string } {
  return goal.kind === 'minutes'
    ? { en: `${goal.target} minutes of reading`, zh: `读 ${goal.target} 分钟` }
    : { en: `${goal.target} words of review`, zh: `复习 ${goal.target} 个词` };
}

/** Streak reminder: one a day at most, in the evening of the user's stored zone. */
async function sweepStreakRisk(deps: LifecycleDeps): Promise<LifecycleSendResult[]> {
  const now = deps.now();
  if (!userTableExists(deps.database)) return [];
  const recent = addDaysToDateString(now.toISOString().slice(0, 10), -3);
  const candidates = deps.database
    .prepare(
      `SELECT u.id, u.email, u.name, u.emailVerified, u.createdAt FROM user u
        WHERE u.emailVerified = 1
          AND ${SUSPENDED_FILTER}
          AND EXISTS (SELECT 1 FROM dailyStats d WHERE d.userId = u.id AND d.date >= ?)`,
    )
    .all(recent) as LifecycleUser[];
  const since = goalStreakSince(deps.database);
  const results: LifecycleSendResult[] = [];
  let visited = 0;
  for (const user of candidates) {
    if (visited > 0 && visited % REVIEW_DUE_YIELD_EVERY === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    visited += 1;
    try {
      if (!user.email || isUnsubscribed(deps.database, user.email)) continue;
      const zone = storedTimeZone(deps.database, user.id);
      if (!zone || localHour(now, zone) < STREAK_RISK_FROM_HOUR) continue;
      if (inBackoff(deps, user.id, LIFECYCLE_TEMPLATES.streakRisk)) continue;
      const today = dateStringInTimeZone(now, zone);
      if (alreadySent(deps.database, user.id, `${LIFECYCLE_TEMPLATES.reviewDue}:${today}`))
        continue;
      const rows = deps.database
        .prepare(
          'SELECT date, dictionaryLookups, clozePracticed, minutesRead, ankiReviews FROM dailyStats WHERE userId = ?',
        )
        .all(user.id) as DailyActivityRow[];
      const goal = readDailyGoal(deps.database, user.id);
      const days = goalDateSet(rows, goal, since);
      if (days.has(today)) continue;
      const { current } = computeStreaks(days, today);
      if (current < STREAK_RISK_MIN_DAYS) continue;
      const words = goalWords(goal);
      results.push(
        await sendOnce(user, LIFECYCLE_TEMPLATES.streakRisk, deps, {
          key: `${LIFECYCLE_TEMPLATES.streakRisk}:${today}`,
          vars: { STREAK_DAYS: String(current), GOAL_EN: words.en, GOAL_ZH: words.zh },
          backoff: true,
        }),
      );
    } catch (err) {
      console.error(`[lifecycle-email] streak mail failed for ${user.id}:`, err);
      Sentry.captureException(err);
    }
  }
  return results;
}

/** The worker runs in cloud mode; each sweep checks the admin switch itself. */
function lifecycleWorkerEnabled(): boolean {
  return config.authRequired;
}

let loopTimer: ReturnType<typeof setInterval> | null = null;
let kickTimer: ReturnType<typeof setTimeout> | null = null;
let ticking = false;

export function startLifecycleEmailWorker(): boolean {
  if (!lifecycleWorkerEnabled()) return false;
  if (loopTimer) return true;

  const intervalMs = Math.max(
    60_000,
    parseInt(process.env.LIFECYCLE_EMAIL_INTERVAL_MS || String(15 * 60_000), 10) || 15 * 60_000,
  );

  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      const { sent } = await sweepLifecycleEmails();
      if (sent > 0) console.log(`[lifecycle-email] sent ${sent} template(s)`);
    } catch (err) {
      Sentry.captureException(err);
      console.error('[lifecycle-email] tick failed:', err);
    } finally {
      ticking = false;
    }
  };

  loopTimer = setInterval(tick, intervalMs);
  loopTimer.unref?.();
  kickTimer = setTimeout(tick, 5_000);
  kickTimer.unref?.();
  console.log(`[lifecycle-email] enabled (every ${intervalMs}ms)`);
  return true;
}

export function stopLifecycleEmailWorker(): void {
  if (loopTimer) clearInterval(loopTimer);
  if (kickTimer) clearTimeout(kickTimer);
  loopTimer = null;
  kickTimer = null;
}
