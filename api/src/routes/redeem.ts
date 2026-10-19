import { Hono } from 'hono';
import { db } from '../db';
import { getCurrentUserId } from '../lib/user';
import { getUserEmail, isEntitledStatus, resolveBillingStatus } from '../lib/billing';
import { entitlements, type EntitlementsEngine } from '../lib/entitlements';
import { redeemCode } from '../lib/redeem';
import { AttemptLimiter } from '../lib/attempt-limiter';

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
  const limiter = new AttemptLimiter();

  app.post('/', async (c) => {
    const userId = getCurrentUserId(c);
    const wait = limiter.retryAfterSeconds(userId, now());
    if (wait > 0) {
      c.header('Retry-After', String(wait));
      return c.json({ error: 'too_many_attempts', retryAfterSeconds: wait }, 429);
    }

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
      if (result.error === 'invalid_code') limiter.fail(userId, now());
      return c.json(
        { error: result.error, attemptsLeft: limiter.attemptsLeft(userId, now()) },
        result.error === 'invalid_code' ? 404 : 409,
      );
    }
    if (result.stored) {
      const { plan, days, expiresAt } = result.card;
      return c.json({ stored: true, plan, days, expiresAt });
    }
    return c.json({ stored: false, plan: result.grant.plan, endsAt: result.grant.endsAt });
  });

  return app;
}

export default makeRedeemRoutes();
