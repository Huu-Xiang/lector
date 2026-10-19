import { randomBytes, randomUUID } from 'crypto';
import { db } from '../db';
import {
  activeGrant,
  addMonths,
  grantPlan,
  planRank,
  type GrantPlan,
  type PlanGrant,
} from './plan-grants';

/** A card saved from a code stays usable this long after the plan that blocked it ends. */
export const STORED_CARD_MONTHS = 6;

export interface RedeemCampaign {
  id: string;
  name: string;
  plan: GrantPlan;
  days: number;
  perUserLimit: number;
  totalLimit: number | null;
  expiresAt: string | null;
  active: number;
  createdAt: string;
}

export type RedeemError =
  | 'invalid_code'
  | 'expired'
  | 'used_up'
  | 'already_redeemed'
  | 'email_not_verified';

export interface StoredCard {
  id: string;
  plan: GrantPlan;
  days: number;
  expiresAt: string;
}

export type RedeemResult =
  | { ok: true; stored: false; grant: PlanGrant }
  | { ok: true; stored: true; card: StoredCard }
  | { ok: false; error: RedeemError };

/** Codes are case-insensitive; spaces and dashes typed by people are ignored. */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, '');
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 12 characters without look-alikes (no 0/O, 1/I). */
export function randomCode(prefix = ''): string {
  const bytes = randomBytes(12);
  let body = '';
  for (const byte of bytes) body += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return normalizeCode(prefix) + body;
}

export function createCampaign(args: {
  name: string;
  plan: GrantPlan;
  days: number;
  perUserLimit: number;
  totalLimit: number | null;
  expiresAt: string | null;
  codes: { mode: 'shared'; code: string } | { mode: 'batch'; count: number; prefix?: string };
  now?: Date;
}): { campaign: RedeemCampaign; codes: string[] } {
  const now = (args.now ?? new Date()).toISOString();
  const campaign: RedeemCampaign = {
    id: randomUUID(),
    name: args.name,
    plan: args.plan,
    days: args.days,
    perUserLimit: args.perUserLimit,
    totalLimit: args.totalLimit,
    expiresAt: args.expiresAt,
    active: 1,
    createdAt: now,
  };
  const codes: string[] = [];
  db.transaction(() => {
    db.prepare(
      `INSERT INTO redeem_campaigns
         (id, name, plan, days, perUserLimit, totalLimit, expiresAt, active, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    ).run(
      campaign.id,
      campaign.name,
      campaign.plan,
      campaign.days,
      campaign.perUserLimit,
      campaign.totalLimit,
      campaign.expiresAt,
      now,
    );
    const insert = db.prepare(
      'INSERT INTO redeem_codes (code, campaignId, maxUses, uses, createdAt) VALUES (?, ?, ?, 0, ?)',
    );
    if (args.codes.mode === 'shared') {
      const code = normalizeCode(args.codes.code);
      insert.run(code, campaign.id, null, now);
      codes.push(code);
    } else {
      while (codes.length < args.codes.count) {
        const code = randomCode(args.codes.prefix);
        if (db.prepare('SELECT 1 FROM redeem_codes WHERE code = ?').get(code)) continue;
        insert.run(code, campaign.id, 1, now);
        codes.push(code);
      }
    }
  })();
  return { campaign, codes };
}

export function listCampaigns(): Array<RedeemCampaign & { codes: number; uses: number }> {
  return db
    .prepare(
      `SELECT c.*,
         (SELECT COUNT(*) FROM redeem_codes k WHERE k.campaignId = c.id) AS codes,
         (SELECT COUNT(*) FROM redeem_uses u WHERE u.campaignId = c.id) AS uses
       FROM redeem_campaigns c ORDER BY c.createdAt DESC`,
    )
    .all() as Array<RedeemCampaign & { codes: number; uses: number }>;
}

export function campaignCodes(campaignId: string): Array<{ code: string; uses: number }> {
  return db
    .prepare('SELECT code, uses FROM redeem_codes WHERE campaignId = ? ORDER BY createdAt, code')
    .all(campaignId) as Array<{ code: string; uses: number }>;
}

export function setCampaignActive(campaignId: string, active: boolean): boolean {
  return (
    db
      .prepare('UPDATE redeem_campaigns SET active = ? WHERE id = ?')
      .run(active ? 1 : 0, campaignId).changes > 0
  );
}

/**
 * Redeem `rawCode` for `userId`. Same tier extends the current period and a
 * higher tier starts now. A lower tier, or any code while a subscription runs,
 * is saved as a card (`reward_cards`) to activate later from Settings.
 */
export function redeemCode(args: {
  userId: string;
  rawCode: string;
  currentPlan: string;
  hasSubscription: boolean;
  emailVerified: boolean;
  now?: Date;
}): RedeemResult {
  const now = args.now ?? new Date();
  const code = normalizeCode(args.rawCode);
  if (!code) return { ok: false, error: 'invalid_code' };
  if (!args.emailVerified) return { ok: false, error: 'email_not_verified' };

  return db.transaction((): RedeemResult => {
    const row = db
      .prepare(
        `SELECT k.code, k.maxUses, k.uses, c.id AS campaignId, c.plan, c.days, c.perUserLimit,
                c.totalLimit, c.expiresAt, c.active
         FROM redeem_codes k JOIN redeem_campaigns c ON c.id = k.campaignId WHERE k.code = ?`,
      )
      .get(code) as
      | {
          code: string;
          maxUses: number | null;
          uses: number;
          campaignId: string;
          plan: GrantPlan;
          days: number;
          perUserLimit: number;
          totalLimit: number | null;
          expiresAt: string | null;
          active: number;
        }
      | undefined;
    if (!row || !row.active) return { ok: false, error: 'invalid_code' };
    if (row.expiresAt && row.expiresAt <= now.toISOString()) return { ok: false, error: 'expired' };
    if (row.maxUses !== null && row.uses >= row.maxUses) return { ok: false, error: 'used_up' };
    if (row.totalLimit !== null) {
      const total = db
        .prepare('SELECT COUNT(*) AS n FROM redeem_uses WHERE campaignId = ?')
        .get(row.campaignId) as { n: number };
      if (total.n >= row.totalLimit) return { ok: false, error: 'used_up' };
    }
    const mine = db
      .prepare('SELECT COUNT(*) AS n FROM redeem_uses WHERE campaignId = ? AND userId = ?')
      .get(row.campaignId, args.userId) as { n: number };
    if (mine.n >= row.perUserLimit) return { ok: false, error: 'already_redeemed' };

    const useId = randomUUID();
    db.prepare(
      'INSERT INTO redeem_uses (id, code, campaignId, userId, at) VALUES (?, ?, ?, ?, ?)',
    ).run(useId, code, row.campaignId, args.userId, now.toISOString());
    db.prepare('UPDATE redeem_codes SET uses = uses + 1 WHERE code = ?').run(code);

    const current = args.currentPlan;
    const higherPlanActive =
      (current === 'cloud' || current === 'plus' || current === 'max') &&
      planRank(current) > planRank(row.plan);
    if (args.hasSubscription || higherPlanActive) {
      const heldUntil = activeGrant(args.userId, now)?.endsAt;
      const from = heldUntil && heldUntil > now.toISOString() ? new Date(heldUntil) : now;
      const card: StoredCard = {
        id: randomUUID(),
        plan: row.plan,
        days: row.days,
        expiresAt: addMonths(from, STORED_CARD_MONTHS).toISOString(),
      };
      db.prepare(
        `INSERT INTO reward_cards (id, userId, plan, days, source, ref, createdAt, expiresAt)
         VALUES (?, ?, ?, ?, 'redeem', ?, ?, ?)`,
      ).run(
        card.id,
        args.userId,
        card.plan,
        card.days,
        `redeem:${useId}`,
        now.toISOString(),
        card.expiresAt,
      );
      return { ok: true, stored: true, card };
    }

    const grant = grantPlan({
      userId: args.userId,
      plan: row.plan,
      days: row.days,
      source: 'redeem',
      ref: `redeem:${useId}`,
      now,
    });
    return { ok: true, stored: false, grant };
  })();
}
