import '../test-guard';
import { beforeEach, describe, expect, test } from 'bun:test';
import { db } from '../db';
import { activeGrant } from './plan-grants';
import { createCampaign, normalizeCode, redeemCode } from './redeem';

const NOW = new Date('2026-10-15T00:00:00Z');

function campaign(over: Partial<Parameters<typeof createCampaign>[0]> = {}) {
  return createCampaign({
    name: 'test',
    plan: 'cloud',
    days: 14,
    perUserLimit: 1,
    totalLimit: null,
    expiresAt: null,
    codes: { mode: 'shared', code: `T${Math.random().toString(36).slice(2, 10)}` },
    now: NOW,
    ...over,
  });
}

function redeem(
  userId: string,
  code: string,
  over: Partial<Parameters<typeof redeemCode>[0]> = {},
) {
  return redeemCode({
    userId,
    rawCode: code,
    currentPlan: 'free',
    hasSubscription: false,
    emailVerified: true,
    now: NOW,
    ...over,
  });
}

beforeEach(() => {
  db.prepare("DELETE FROM plan_grants WHERE userId LIKE 'rd-%'").run();
  db.prepare("DELETE FROM redeem_uses WHERE userId LIKE 'rd-%'").run();
});

describe('redeem codes', () => {
  test('a shared code grants its tier for its days, once per person', () => {
    const { codes } = campaign();
    const first = redeem('rd-a', codes[0].toLowerCase());
    expect(first).toMatchObject({ ok: true, grant: { plan: 'cloud' } });
    expect(activeGrant('rd-a', NOW)?.endsAt).toBe('2026-10-29T00:00:00.000Z');
    expect(redeem('rd-a', codes[0])).toEqual({ ok: false, error: 'already_redeemed' });
    expect(redeem('rd-b', codes[0]).ok).toBe(true);
  });

  test('batch codes are single use and look-alike free', () => {
    const { codes } = campaign({ codes: { mode: 'batch', count: 3, prefix: 'vip' } });
    expect(codes).toHaveLength(3);
    for (const code of codes) expect(code).toMatch(/^VIP[A-HJ-NP-Z2-9]{12}$/);
    expect(redeem('rd-c', codes[0]).ok).toBe(true);
    expect(redeem('rd-d', codes[0])).toEqual({ ok: false, error: 'used_up' });
  });

  test('a campaign with a higher per-person limit extends the same tier', () => {
    const { codes } = campaign({ perUserLimit: 5 });
    redeem('rd-e', codes[0]);
    redeem('rd-e', codes[0]);
    expect(activeGrant('rd-e', NOW)?.endsAt).toBe('2026-11-12T00:00:00.000Z');
  });

  test('refuses expired, over-limit, lower-tier, subscribed and unverified cases', () => {
    const expired = campaign({ expiresAt: '2026-10-01T00:00:00.000Z' }).codes[0];
    expect(redeem('rd-f', expired)).toEqual({ ok: false, error: 'expired' });
    const capped = campaign({ totalLimit: 1 }).codes[0];
    expect(redeem('rd-f', capped).ok).toBe(true);
    expect(redeem('rd-g', capped)).toEqual({ ok: false, error: 'used_up' });
    const plus = campaign().codes[0];
    expect(redeem('rd-h', plus, { currentPlan: 'max' })).toEqual({
      ok: false,
      error: 'higher_plan_active',
    });
    expect(redeem('rd-h', plus, { hasSubscription: true })).toEqual({
      ok: false,
      error: 'subscription_active',
    });
    expect(redeem('rd-h', plus, { emailVerified: false })).toEqual({
      ok: false,
      error: 'email_not_verified',
    });
    expect(redeem('rd-h', 'NOPE-NOPE')).toEqual({ ok: false, error: 'invalid_code' });
  });

  test('normalizes what people type', () => {
    expect(normalizeCode(' welcome-123 ')).toBe('WELCOME123');
  });
});
