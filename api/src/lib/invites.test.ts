import '../test-guard';
import { beforeEach, describe, expect, test } from 'bun:test';
import { db } from '../db';
import { AttemptLimiter } from './attempt-limiter';
import { activeGrant } from './plan-grants';
import { purgeTenantData } from './account-deletion';
import { createCampaign } from './redeem';
import {
  MAX_CODE_SIGNUPS,
  MAX_REWARDED_INVITES,
  activateCard,
  attachInvite,
  canonicalEmail,
  getOrCreateInviteCode,
  isAcceptableSignupCode,
  listCards,
  settleInvite,
} from './invites';

const NOW = new Date('2026-10-20T00:00:00Z');
const SECRET = 'test-secret';

db.exec(`CREATE TABLE IF NOT EXISTS "user" (
  "id" text not null primary key, "name" text not null, "email" text not null unique,
  "emailVerified" integer not null, "image" text, "createdAt" date not null,
  "updatedAt" date not null, "twoFactorEnabled" integer)`);

function addUser(id: string, email: string, opts: { verified?: boolean; created?: Date } = {}) {
  const created = (opts.created ?? NOW).toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, id, email, opts.verified === false ? 0 : 1, created, created);
}

function study(userId: string, minutes: number, saved = 0) {
  db.prepare(
    `INSERT OR REPLACE INTO dailyStats (userId, date, language, minutesRead, newWordsSaved)
     VALUES (?, '2026-10-20', 'es', ?, ?)`,
  ).run(userId, minutes, saved);
}

beforeEach(() => {
  process.env.BETTER_AUTH_SECRET = SECRET;
  delete process.env.INVITE_REWARDS;
  for (const t of ['invite_codes', 'invites', 'reward_cards', 'invite_burned_emails']) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
  db.prepare("DELETE FROM plan_grants WHERE userId LIKE 'iv-%'").run();
  db.prepare("DELETE FROM dailyStats WHERE userId LIKE 'iv-%'").run();
  db.prepare('DELETE FROM "user" WHERE id LIKE \'iv-%\'').run();
  addUser('iv-a', 'alice@example.test');
  addUser('iv-b', 'bob@example.test');
});

describe('canonicalEmail', () => {
  test('folds Gmail dots, +tags and case', () => {
    expect(canonicalEmail('A.l.i+x@Gmail.com')).toBe('ali@gmail.com');
    expect(canonicalEmail('ali@googlemail.com')).toBe('ali@gmail.com');
    expect(canonicalEmail('a.li+y@example.test')).toBe('a.li@example.test');
  });
});

describe('attachInvite', () => {
  test('attaches once and refuses a second code', () => {
    const code = getOrCreateInviteCode('iv-a', NOW);
    expect(getOrCreateInviteCode('iv-a', NOW)).toBe(code);
    expect(attachInvite({ inviteeId: 'iv-b', rawCode: code.toLowerCase(), now: NOW })).toEqual({
      ok: true,
    });
    expect(attachInvite({ inviteeId: 'iv-b', rawCode: code, now: NOW })).toEqual({
      ok: false,
      error: 'already_attached',
    });
  });

  test('refuses unknown codes, own codes, and the same mailbox', () => {
    const code = getOrCreateInviteCode('iv-a', NOW);
    expect(attachInvite({ inviteeId: 'iv-b', rawCode: 'NOPE', now: NOW })).toEqual({
      ok: false,
      error: 'invalid_code',
    });
    expect(attachInvite({ inviteeId: 'iv-a', rawCode: code, now: NOW })).toEqual({
      ok: false,
      error: 'self_invite',
    });
    db.prepare('UPDATE "user" SET email = ? WHERE id = ?').run('alice+z@gmail.com', 'iv-a');
    addUser('iv-d', 'al.ice@gmail.com');
    expect(attachInvite({ inviteeId: 'iv-d', rawCode: code, now: NOW })).toEqual({
      ok: false,
      error: 'self_invite',
    });
  });

  test('closes after the claim window and when the code is used up', () => {
    const code = getOrCreateInviteCode('iv-a', NOW);
    const later = new Date(NOW.getTime() + 8 * 86_400_000);
    expect(attachInvite({ inviteeId: 'iv-b', rawCode: code, now: later })).toEqual({
      ok: false,
      error: 'window_closed',
    });
    for (let i = 0; i < MAX_CODE_SIGNUPS; i++) {
      db.prepare(
        "INSERT INTO invites (id, inviteeId, inviterId, code, status, claimedAt) VALUES (?, NULL, 'iv-a', ?, 'rewarded', ?)",
      ).run(`x${i}`, code, NOW.toISOString());
    }
    expect(attachInvite({ inviteeId: 'iv-b', rawCode: code, now: NOW })).toEqual({
      ok: false,
      error: 'used_up',
    });
    expect(isAcceptableSignupCode(code)).toBe(false);
  });

  test('the sign-up gate also accepts a live admin code', () => {
    const { codes } = createCampaign({
      name: 'gate',
      plan: 'cloud',
      days: 14,
      perUserLimit: 1,
      totalLimit: null,
      expiresAt: null,
      codes: { mode: 'batch', count: 1, prefix: 'IVG' },
      now: NOW,
    });
    expect(isAcceptableSignupCode(codes[0])).toBe(true);
    expect(isAcceptableSignupCode('')).toBe(false);
    expect(isAcceptableSignupCode('WRONGCODE')).toBe(false);
  });
});

describe('settleInvite', () => {
  function invite() {
    const code = getOrCreateInviteCode('iv-a', NOW);
    attachInvite({ inviteeId: 'iv-b', rawCode: code, now: NOW });
  }

  test('waits for a verified email and real use', () => {
    invite();
    expect(settleInvite('iv-b', NOW)).toBe(false);
    study('iv-b', 4, 2);
    expect(settleInvite('iv-b', NOW)).toBe(false);
    db.prepare('UPDATE "user" SET emailVerified = 0 WHERE id = ?').run('iv-b');
    study('iv-b', 9);
    expect(settleInvite('iv-b', NOW)).toBe(false);
    db.prepare('UPDATE "user" SET emailVerified = 1 WHERE id = ?').run('iv-b');
    expect(settleInvite('iv-b', NOW)).toBe(true);
    expect(listCards('iv-a', NOW)).toHaveLength(1);
    expect(listCards('iv-b', NOW)).toHaveLength(1);
    expect(settleInvite('iv-b', NOW)).toBe(false);
    expect(listCards('iv-a', NOW)).toHaveLength(1);
  });

  test('saving three words counts as use', () => {
    invite();
    study('iv-b', 0, 3);
    expect(settleInvite('iv-b', NOW)).toBe(true);
  });

  test('the kill switch stops rewards', () => {
    invite();
    study('iv-b', 9);
    process.env.INVITE_REWARDS = '0';
    expect(settleInvite('iv-b', NOW)).toBe(false);
  });

  test('the inviter stops earning after the cap, the invitee still gets a card', () => {
    for (let i = 0; i < MAX_REWARDED_INVITES; i++) {
      db.prepare(
        "INSERT INTO invites (id, inviteeId, inviterId, code, status, claimedAt) VALUES (?, NULL, 'iv-a', 'X', 'rewarded', ?)",
      ).run(`r${i}`, NOW.toISOString());
    }
    invite();
    study('iv-b', 9);
    expect(settleInvite('iv-b', NOW)).toBe(true);
    expect(listCards('iv-a', NOW)).toHaveLength(0);
    expect(listCards('iv-b', NOW)).toHaveLength(1);
  });

  test('deleting the invitee keeps the count and blocks the same email', () => {
    invite();
    study('iv-b', 9);
    settleInvite('iv-b', NOW);
    purgeTenantData('iv-b', 'bob@example.test');
    db.prepare('DELETE FROM "user" WHERE id = ?').run('iv-b');
    const row = db
      .prepare("SELECT inviteeId, status FROM invites WHERE inviterId = 'iv-a'")
      .get() as { inviteeId: string | null; status: string };
    expect(row).toEqual({ inviteeId: null, status: 'rewarded' });
    expect(listCards('iv-b', NOW)).toHaveLength(0);

    addUser('iv-b2', 'b.ob+again@example.test'.replace('b.ob', 'bob'));
    expect(
      attachInvite({ inviteeId: 'iv-b2', rawCode: getOrCreateInviteCode('iv-a', NOW), now: NOW }),
    ).toEqual({ ok: false, error: 'email_used' });
  });
});

describe('activateCard', () => {
  function oneCard(userId: string) {
    db.prepare(
      `INSERT INTO reward_cards (id, userId, plan, days, source, ref, createdAt, expiresAt)
       VALUES (?, ?, 'cloud', 14, 'invite', ?, ?, ?)`,
    ).run(`card-${userId}`, userId, `ref-${userId}`, NOW.toISOString(), '2027-10-20T00:00:00.000Z');
    return `card-${userId}`;
  }
  const base = { currentPlan: 'free', hasSubscription: false, now: NOW };

  test('grants 14 days of Plus once', () => {
    const id = oneCard('iv-a');
    const first = activateCard({ userId: 'iv-a', cardId: id, ...base });
    expect(first.ok).toBe(true);
    expect(activeGrant('iv-a', NOW)?.plan).toBe('cloud');
    expect(activateCard({ userId: 'iv-a', cardId: id, ...base })).toEqual({
      ok: false,
      error: 'already_used',
    });
  });

  test('waits while a higher plan or a subscription is active', () => {
    const id = oneCard('iv-a');
    expect(activateCard({ userId: 'iv-a', cardId: id, ...base, currentPlan: 'plus' })).toEqual({
      ok: false,
      error: 'higher_plan_active',
    });
    expect(activateCard({ userId: 'iv-a', cardId: id, ...base, hasSubscription: true })).toEqual({
      ok: false,
      error: 'subscription_active',
    });
    expect(listCards('iv-a', NOW)).toHaveLength(1);
  });

  test('refuses another user, an expired card and an unknown card', () => {
    const id = oneCard('iv-a');
    expect(activateCard({ userId: 'iv-b', cardId: id, ...base })).toEqual({
      ok: false,
      error: 'not_found',
    });
    const late = new Date('2027-11-01T00:00:00Z');
    expect(activateCard({ userId: 'iv-a', cardId: id, ...base, now: late })).toEqual({
      ok: false,
      error: 'expired',
    });
    expect(activateCard({ userId: 'iv-a', cardId: 'nope', ...base })).toEqual({
      ok: false,
      error: 'not_found',
    });
  });
});

describe('AttemptLimiter', () => {
  test('blocks after the maximum and reports the wait', () => {
    const limiter = new AttemptLimiter(3, 60_000);
    for (let i = 0; i < 3; i++) limiter.fail('u', 1000 + i);
    expect(limiter.attemptsLeft('u', 2000)).toBe(0);
    expect(limiter.retryAfterSeconds('u', 2000)).toBe(59);
    expect(limiter.retryAfterSeconds('u', 61_001)).toBe(0);
    expect(limiter.attemptsLeft('other', 2000)).toBe(3);
  });
});
