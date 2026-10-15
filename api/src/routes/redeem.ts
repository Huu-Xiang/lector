import { Hono } from 'hono';
import { db } from '../db';
import { getCurrentUserId } from '../lib/user';
import { getUserEmail, isEntitledStatus, resolveBillingStatus } from '../lib/billing';
import { entitlements, type EntitlementsEngine } from '../lib/entitlements';
import { redeemCode } from '../lib/redeem';

const FAILURE_WINDOW_MS = 60 * 60_000;
const MAX_FAILURES = 10;

export function makeRedeemRoutes(
  engine: EntitlementsEngine = entitlements,
  hasSubscription: (userId: string) => boolean = (userId) =>
    isEntitledStatus(resolveBillingStatus(userId, getUserEmail(userId))),
  isEmailVerified: (userId: string) => boolean = (userId) => {
    const row = db.prepare('SELECT emailVerified FROM user WHERE id = ?').get(userId) as
      | { emailVerified: number | boolean }
      | undefined;
    // Self-host has no user table rows for the local tenant; nothing to verify.
    return row === undefined || Boolean(row.emailVerified);
  },
  now: () => number = Date.now,
) {
  const app = new Hono();
  const failures = new Map<string, number[]>();

  app.post('/', async (c) => {
    const userId = getCurrentUserId(c);
    const recent = (failures.get(userId) ?? []).filter((t) => now() - t < FAILURE_WINDOW_MS);
    if (recent.length >= MAX_FAILURES) return c.json({ error: 'too_many_attempts' }, 429);

    const body = (await c.req.json().catch(() => ({}))) as { code?: unknown };
    const result = redeemCode({
      userId,
      rawCode: typeof body.code === 'string' ? body.code.slice(0, 64) : '',
      currentPlan: engine.resolveEntitlements(userId).plan,
      hasSubscription: hasSubscription(userId),
      emailVerified: isEmailVerified(userId),
      now: new Date(now()),
    });
    if (!result.ok) {
      if (result.error === 'invalid_code') failures.set(userId, [...recent, now()]);
      return c.json({ error: result.error }, result.error === 'invalid_code' ? 404 : 409);
    }
    return c.json({ plan: result.grant.plan, endsAt: result.grant.endsAt });
  });

  return app;
}

export default makeRedeemRoutes();
