import '../test-guard';
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { db } from '../db';
import { purgeTenantData } from './account-deletion';
import { runAfterEmailVerification } from './accounts';
import { activeGrant } from './plan-grants';
import { createCampaign, redeemSignupCode } from './redeem';
import {
  backfillWelcomeClaims,
  recordWelcomeClaim,
  WELCOME_DOMAIN_LIMIT,
  welcomeClaimKeys,
} from './welcome-claims';
import { WELCOME_CODE } from './welcome-offer';

const NOW = new Date('2026-11-10T00:00:00Z');
const DAY = 86_400_000;

function addUser(id: string, email: string) {
  const cols = db.prepare('PRAGMA table_info(user)').all() as { name: string }[];
  if (cols.length === 0) {
    db.exec('CREATE TABLE user (id TEXT PRIMARY KEY, email TEXT NOT NULL)');
  }
  const values: Record<string, unknown> = {
    id,
    email,
    name: 'T',
    emailVerified: 1,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
  const names = (db.prepare('PRAGMA table_info(user)').all() as { name: string }[])
    .map((c) => c.name)
    .filter((n) => n in values);
  db.prepare(
    `INSERT OR REPLACE INTO user (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`,
  ).run(...names.map((n) => values[n] as string | number));
}

function dropUser(id: string) {
  db.prepare('DELETE FROM user WHERE id = ?').run(id);
}

function dropWelcomeCampaign() {
  db.prepare('DELETE FROM redeem_uses WHERE code = ?').run(WELCOME_CODE);
  db.prepare('DELETE FROM redeem_codes WHERE code = ?').run(WELCOME_CODE);
  db.prepare("DELETE FROM redeem_campaigns WHERE name = 'welcome-claims-test'").run();
}

function cleanup() {
  dropWelcomeCampaign();
  db.prepare('DELETE FROM welcome_claims').run();
  db.prepare("DELETE FROM user WHERE id LIKE 'wc-%'").run();
  db.prepare("DELETE FROM plan_grants WHERE userId LIKE 'wc-%'").run();
}

beforeEach(() => {
  cleanup();
  createCampaign({
    name: 'welcome-claims-test',
    plan: 'cloud',
    days: 15,
    perUserLimit: 1,
    totalLimit: 1000,
    expiresAt: '2027-01-01T00:00:00.000Z',
    codes: { mode: 'shared', code: WELCOME_CODE },
    now: NOW,
  });
});

afterAll(cleanup);

function claim(id: string, email: string, now = NOW) {
  addUser(id, email);
  return redeemSignupCode(id, now);
}

describe('welcome offer once per mailbox', () => {
  test('stores hashes only', () => {
    claim('wc-h', 'Person@Corp.test');
    const row = db.prepare('SELECT * FROM welcome_claims').get() as Record<string, string>;
    expect(JSON.stringify(row)).not.toContain('corp.test');
    expect(row.emailHash).toBe(welcomeClaimKeys('person@corp.test').emailHash);
  });

  test('delete then sign up again with the same address gets no plan', () => {
    expect(claim('wc-a1', 'me@corp.test').ok).toBe(true);
    purgeTenantData('wc-a1', 'me@corp.test');
    dropUser('wc-a1');
    expect(claim('wc-a2', 'me@corp.test')).toEqual({ ok: false, error: 'used_up' });
    expect(activeGrant('wc-a2', NOW)).toBeFalsy();
  });

  test('a Gmail dot or tag variant is the same mailbox', () => {
    expect(claim('wc-g1', 'first.last@gmail.com').ok).toBe(true);
    purgeTenantData('wc-g1', 'first.last@gmail.com');
    dropUser('wc-g1');
    expect(claim('wc-g2', 'firstlast+x@googlemail.com').ok).toBe(false);
    expect(claim('wc-g3', 'f.i.r.s.t.l.a.s.t@gmail.com').ok).toBe(false);
  });

  test('a fourth claim from one private domain in 30 days is refused', () => {
    for (let i = 1; i <= WELCOME_DOMAIN_LIMIT; i++) {
      expect(claim(`wc-d${i}`, `u${i}@catchall.test`).ok).toBe(true);
    }
    expect(claim('wc-d4', 'u4@catchall.test').ok).toBe(false);
    expect(activeGrant('wc-d4', NOW)).toBeFalsy();
    expect(claim('wc-d5', 'u5@other-domain.test').ok).toBe(true);
  });

  test('public providers are not limited', () => {
    for (let i = 1; i <= 6; i++) {
      expect(claim(`wc-p${i}`, `user${i}@outlook.com`).ok).toBe(true);
    }
    expect(claim('wc-p7', 'user7@gmx.de').ok).toBe(true);
  });

  test('a claim after 30 days works', () => {
    for (let i = 1; i <= WELCOME_DOMAIN_LIMIT; i++) claim(`wc-t${i}`, `u${i}@slow.test`);
    expect(claim('wc-t4', 'u4@slow.test').ok).toBe(false);
    const later = new Date(NOW.getTime() + 31 * DAY);
    expect(claim('wc-t5', 'u5@slow.test', later).ok).toBe(true);
  });

  test('the backfill records earlier redeemers and is idempotent', () => {
    claim('wc-b1', 'old@corp.test');
    claim('wc-b2', 'Old.Two@Gmail.com');
    db.prepare('DELETE FROM welcome_claims').run();
    expect(backfillWelcomeClaims(db)).toBe(2);
    expect(backfillWelcomeClaims(db)).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM welcome_claims').get()).toEqual({ n: 2 });
    dropUser('wc-b1');
    expect(claim('wc-b3', 'old@corp.test').ok).toBe(false);
  });

  test('a refused claim does not throw and is logged without the address', () => {
    recordWelcomeClaim(db, 'taken@corp.test', NOW);
    addUser('wc-r1', 'taken@corp.test');
    const logged: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void logged.push(args.map(String).join(' '));
    try {
      expect(() =>
        runAfterEmailVerification(
          { id: 'wc-r1', email: 'taken@corp.test' },
          {
            redeem: (id: string) => redeemSignupCode(id, NOW),
            welcome: async () => 'sent',
          },
        ),
      ).not.toThrow();
    } finally {
      console.error = original;
    }
    expect(activeGrant('wc-r1', NOW)).toBeFalsy();
    expect(logged.some((l) => l.includes('wc-r1'))).toBe(true);
    expect(logged.join('\n')).not.toContain('corp.test');
  });
});
