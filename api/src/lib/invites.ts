import { createHmac, randomBytes, randomUUID } from 'crypto';
import { db } from '../db';
import { grantPlan, planRank, type GrantPlan, type PlanGrant } from './plan-grants';
import { normalizeCode } from './redeem';

export const REWARD_PLAN: GrantPlan = 'cloud';
export const REWARD_DAYS = 14;
export const CARD_VALID_MONTHS = 12;
export const MAX_REWARDED_INVITES = 10;
export const MAX_CODE_SIGNUPS = 20;
export const CLAIM_WINDOW_DAYS = 7;
export const BURN_RETENTION_MONTHS = 24;
export const DAILY_CARD_LIMIT = 50;
export const ACTIVE_MINUTES = 5;
export const ACTIVE_SAVED_WORDS = 3;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DAY_MS = 86_400_000;

export type InviteError =
  | 'invalid_code'
  | 'self_invite'
  | 'already_attached'
  | 'window_closed'
  | 'used_up'
  | 'email_used';

export type CardError =
  | 'not_found'
  | 'already_used'
  | 'expired'
  | 'higher_plan_active'
  | 'subscription_active';

export function inviteRequired(): boolean {
  return process.env.INVITE_REQUIRED === '1';
}

export function inviteRewardsEnabled(): boolean {
  return process.env.INVITE_REWARDS !== '0';
}

/** Lower-case, no `+tag`; Gmail also ignores dots. Two spellings of one mailbox compare equal. */
export function canonicalEmail(email: string): string {
  const [rawLocal = '', domain = ''] = email.trim().toLowerCase().split('@');
  let local = rawLocal.split('+')[0];
  if (domain === 'gmail.com' || domain === 'googlemail.com') local = local.replace(/\./g, '');
  return `${local}@${domain === 'googlemail.com' ? 'gmail.com' : domain}`;
}

/** Keyed hash of the canonical email. It cannot be turned back into the address. */
export function emailFingerprint(email: string): string | null {
  const key = process.env.INVITE_PEPPER || process.env.BETTER_AUTH_SECRET;
  if (!key) return null;
  return createHmac('sha256', key)
    .update(`invite-email:${canonicalEmail(email)}`)
    .digest('hex');
}

function emailOf(userId: string): string | null {
  try {
    const row = db.prepare('SELECT email FROM user WHERE id = ?').get(userId) as
      | { email: string }
      | undefined;
    return row?.email ?? null;
  } catch {
    return null;
  }
}

function isVerified(userId: string): boolean {
  try {
    const row = db.prepare('SELECT emailVerified FROM user WHERE id = ?').get(userId) as
      | { emailVerified: number | boolean }
      | undefined;
    return Boolean(row?.emailVerified);
  } catch {
    return false;
  }
}

function createdAtOf(userId: string): number | null {
  try {
    const row = db.prepare('SELECT createdAt FROM user WHERE id = ?').get(userId) as
      | { createdAt: string | number }
      | undefined;
    const time = row ? new Date(row.createdAt).getTime() : NaN;
    return Number.isNaN(time) ? null : time;
  } catch {
    return null;
  }
}

function randomInviteCode(): string {
  let code = '';
  for (const byte of randomBytes(8)) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

export function getOrCreateInviteCode(userId: string, now = new Date()): string {
  const row = db.prepare('SELECT code FROM invite_codes WHERE userId = ?').get(userId) as
    | { code: string }
    | undefined;
  if (row) return row.code;
  for (;;) {
    const code = randomInviteCode();
    if (db.prepare('SELECT 1 FROM invite_codes WHERE code = ?').get(code)) continue;
    db.prepare('INSERT INTO invite_codes (userId, code, createdAt) VALUES (?, ?, ?)').run(
      userId,
      code,
      now.toISOString(),
    );
    return code;
  }
}

function inviterOfCode(code: string): { userId: string } | undefined {
  return db.prepare('SELECT userId FROM invite_codes WHERE code = ?').get(code) as
    | { userId: string }
    | undefined;
}

function codeSignups(inviterId: string): number {
  return (
    db.prepare('SELECT COUNT(*) AS n FROM invites WHERE inviterId = ?').get(inviterId) as {
      n: number;
    }
  ).n;
}

/** True when `rawCode` is an open personal code or a live admin redeem code. Used by the sign-up gate. */
export function isAcceptableSignupCode(rawCode: string, now = new Date()): boolean {
  const code = normalizeCode(rawCode);
  if (!code) return false;
  const inviter = inviterOfCode(code);
  if (inviter) return codeSignups(inviter.userId) < MAX_CODE_SIGNUPS;
  const row = db
    .prepare(
      `SELECT c.expiresAt, c.active FROM redeem_codes k
       JOIN redeem_campaigns c ON c.id = k.campaignId WHERE k.code = ?`,
    )
    .get(code) as { expiresAt: string | null; active: number } | undefined;
  return !!row && !!row.active && (!row.expiresAt || row.expiresAt > now.toISOString());
}

/** Record that `inviteeId` was invited with `rawCode`. Personal codes only. */
export function attachInvite(args: {
  inviteeId: string;
  rawCode: string;
  now?: Date;
}): { ok: true } | { ok: false; error: InviteError } {
  const now = args.now ?? new Date();
  const code = normalizeCode(args.rawCode);
  const inviter = code ? inviterOfCode(code) : undefined;
  if (!inviter) return { ok: false, error: 'invalid_code' };
  if (inviter.userId === args.inviteeId) return { ok: false, error: 'self_invite' };

  const inviteeEmail = emailOf(args.inviteeId);
  const inviterEmail = emailOf(inviter.userId);
  if (
    inviteeEmail &&
    inviterEmail &&
    canonicalEmail(inviteeEmail) === canonicalEmail(inviterEmail)
  ) {
    return { ok: false, error: 'self_invite' };
  }
  if (db.prepare('SELECT 1 FROM invites WHERE inviteeId = ?').get(args.inviteeId)) {
    return { ok: false, error: 'already_attached' };
  }
  const createdAt = createdAtOf(args.inviteeId);
  if (createdAt !== null && now.getTime() - createdAt > CLAIM_WINDOW_DAYS * DAY_MS) {
    return { ok: false, error: 'window_closed' };
  }
  if (codeSignups(inviter.userId) >= MAX_CODE_SIGNUPS) return { ok: false, error: 'used_up' };
  const fingerprint = inviteeEmail ? emailFingerprint(inviteeEmail) : null;
  if (
    fingerprint &&
    db.prepare('SELECT 1 FROM invite_burned_emails WHERE fingerprint = ?').get(fingerprint)
  ) {
    return { ok: false, error: 'email_used' };
  }

  db.prepare(
    `INSERT INTO invites (id, inviteeId, inviterId, code, status, claimedAt)
     VALUES (?, ?, ?, ?, 'pending', ?)`,
  ).run(randomUUID(), args.inviteeId, inviter.userId, code, now.toISOString());
  return { ok: true };
}

function addMonths(from: Date, months: number): Date {
  const end = new Date(from);
  end.setUTCMonth(end.getUTCMonth() + months);
  return end;
}

export interface RewardCard {
  id: string;
  plan: GrantPlan;
  days: number;
  createdAt: string;
  expiresAt: string;
}

function issueCard(userId: string, ref: string, now: Date): void {
  db.prepare(
    `INSERT OR IGNORE INTO reward_cards (id, userId, plan, days, source, ref, createdAt, expiresAt)
     VALUES (?, ?, ?, ?, 'invite', ?, ?, ?)`,
  ).run(
    randomUUID(),
    userId,
    REWARD_PLAN,
    REWARD_DAYS,
    ref,
    now.toISOString(),
    addMonths(now, CARD_VALID_MONTHS).toISOString(),
  );
}

function activityOf(userId: string): { minutes: number; saved: number } {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(minutesRead), 0) AS minutes, COALESCE(SUM(newWordsSaved), 0) AS saved
       FROM dailyStats WHERE userId = ?`,
    )
    .get(userId) as { minutes: number; saved: number };
  return row;
}

/** Reward a pending invite once the invitee is verified and has really used the app. Returns true when it paid out. */
export function settleInvite(inviteeId: string, now = new Date()): boolean {
  if (!inviteRewardsEnabled()) return false;
  const invite = db
    .prepare("SELECT id, inviterId FROM invites WHERE inviteeId = ? AND status = 'pending'")
    .get(inviteeId) as { id: string; inviterId: string } | undefined;
  if (!invite || !isVerified(inviteeId)) return false;
  const activity = activityOf(inviteeId);
  if (activity.minutes < ACTIVE_MINUTES && activity.saved < ACTIVE_SAVED_WORDS) return false;

  return db.transaction(() => {
    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);
    const issuedToday = (
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM reward_cards WHERE source = 'invite' AND createdAt >= ?",
        )
        .get(today.toISOString()) as { n: number }
    ).n;
    if (issuedToday + 2 > DAILY_CARD_LIMIT) return false;

    const rewarded = (
      db
        .prepare("SELECT COUNT(*) AS n FROM invites WHERE inviterId = ? AND status = 'rewarded'")
        .get(invite.inviterId) as { n: number }
    ).n;
    issueCard(inviteeId, `invite:${invite.id}:invitee`, now);
    if (rewarded < MAX_REWARDED_INVITES)
      issueCard(invite.inviterId, `invite:${invite.id}:inviter`, now);
    db.prepare("UPDATE invites SET status = 'rewarded', rewardedAt = ? WHERE id = ?").run(
      now.toISOString(),
      invite.id,
    );
    const email = emailOf(inviteeId);
    const fingerprint = email ? emailFingerprint(email) : null;
    if (fingerprint) {
      db.prepare(
        'INSERT OR REPLACE INTO invite_burned_emails (fingerprint, burnedAt) VALUES (?, ?)',
      ).run(fingerprint, now.toISOString());
    }
    return true;
  })();
}

/** Settle every pending invite this user sent. */
export function settleInvitesOf(inviterId: string, now = new Date()): void {
  const rows = db
    .prepare(
      "SELECT inviteeId FROM invites WHERE inviterId = ? AND status = 'pending' AND inviteeId IS NOT NULL",
    )
    .all(inviterId) as { inviteeId: string }[];
  for (const row of rows) settleInvite(row.inviteeId, now);
}

export function listCards(userId: string, now = new Date()): RewardCard[] {
  return db
    .prepare(
      `SELECT id, plan, days, createdAt, expiresAt FROM reward_cards
       WHERE userId = ? AND usedAt IS NULL AND expiresAt > ? ORDER BY createdAt`,
    )
    .all(userId, now.toISOString()) as RewardCard[];
}

export function inviteSummary(userId: string) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS invited,
              COALESCE(SUM(status = 'rewarded'), 0) AS rewarded
       FROM invites WHERE inviterId = ?`,
    )
    .get(userId) as { invited: number; rewarded: number };
  const mine = db
    .prepare('SELECT claimedAt, status FROM invites WHERE inviteeId = ?')
    .get(userId) as { claimedAt: string; status: string } | undefined;
  return { ...row, invitedBy: mine ? { status: mine.status } : null };
}

/** Whether `userId` may still enter a code in Settings. */
export function canClaimInvite(userId: string, now = new Date()): boolean {
  if (db.prepare('SELECT 1 FROM invites WHERE inviteeId = ?').get(userId)) return false;
  const createdAt = createdAtOf(userId);
  return createdAt === null || now.getTime() - createdAt <= CLAIM_WINDOW_DAYS * DAY_MS;
}

export function activateCard(args: {
  userId: string;
  cardId: string;
  currentPlan: string;
  hasSubscription: boolean;
  now?: Date;
}): { ok: true; grant: PlanGrant } | { ok: false; error: CardError } {
  const now = args.now ?? new Date();
  return db.transaction((): { ok: true; grant: PlanGrant } | { ok: false; error: CardError } => {
    const card = db
      .prepare(
        'SELECT id, plan, days, expiresAt, usedAt FROM reward_cards WHERE id = ? AND userId = ?',
      )
      .get(args.cardId, args.userId) as
      | { id: string; plan: GrantPlan; days: number; expiresAt: string; usedAt: string | null }
      | undefined;
    if (!card) return { ok: false, error: 'not_found' };
    if (card.usedAt) return { ok: false, error: 'already_used' };
    if (card.expiresAt <= now.toISOString()) return { ok: false, error: 'expired' };
    if (args.hasSubscription) return { ok: false, error: 'subscription_active' };
    const current = args.currentPlan;
    if (
      (current === 'cloud' || current === 'plus' || current === 'max') &&
      planRank(current) > planRank(card.plan)
    ) {
      return { ok: false, error: 'higher_plan_active' };
    }
    const grant = grantPlan({
      userId: args.userId,
      plan: card.plan,
      days: card.days,
      source: 'card',
      ref: `card:${card.id}`,
      now,
    });
    db.prepare('UPDATE reward_cards SET usedAt = ? WHERE id = ?').run(now.toISOString(), card.id);
    return { ok: true, grant };
  })();
}

/** Called from account deletion. The inviter's reward count must outlive the invitee. */
export function detachInviteData(userId: string): void {
  db.prepare("DELETE FROM invites WHERE inviteeId = ? AND status = 'pending'").run(userId);
  db.prepare('UPDATE invites SET inviteeId = NULL WHERE inviteeId = ?').run(userId);
  db.prepare('DELETE FROM invites WHERE inviterId = ?').run(userId);
}

export function purgeOldBurnedEmails(now = new Date()): void {
  db.prepare('DELETE FROM invite_burned_emails WHERE burnedAt < ?').run(
    addMonths(now, -BURN_RETENTION_MONTHS).toISOString(),
  );
}
