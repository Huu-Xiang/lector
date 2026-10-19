import { Hono } from 'hono';
import { getCurrentUserId } from '../lib/user';
import { getUserEmail, isEntitledStatus, resolveBillingStatus } from '../lib/billing';
import { entitlements, type EntitlementsEngine } from '../lib/entitlements';
import { AttemptLimiter } from '../lib/attempt-limiter';
import {
  activateCard,
  attachInvite,
  canClaimInvite,
  getOrCreateInviteCode,
  inviteSummary,
  listCards,
  settleInvite,
  settleInvitesOf,
  MAX_REWARDED_INVITES,
  REWARD_DAYS,
} from '../lib/invites';

export function makeInviteRoutes(
  engine: EntitlementsEngine = entitlements,
  hasSubscription: (userId: string) => boolean = (userId) =>
    isEntitledStatus(resolveBillingStatus(userId, getUserEmail(userId))),
  now: () => number = Date.now,
) {
  const app = new Hono();
  const limiter = new AttemptLimiter();

  function state(userId: string) {
    const at = new Date(now());
    settleInvite(userId, at);
    settleInvitesOf(userId, at);
    return {
      code: getOrCreateInviteCode(userId, at),
      rewardDays: REWARD_DAYS,
      maxRewards: MAX_REWARDED_INVITES,
      ...inviteSummary(userId),
      canClaim: canClaimInvite(userId, at),
      cards: listCards(userId, at),
    };
  }

  app.get('/', (c) => c.json(state(getCurrentUserId(c))));

  app.post('/claim', async (c) => {
    const userId = getCurrentUserId(c);
    const wait = limiter.retryAfterSeconds(userId, now());
    if (wait > 0) {
      c.header('Retry-After', String(wait));
      return c.json({ error: 'too_many_attempts', retryAfterSeconds: wait }, 429);
    }
    const body = (await c.req.json().catch(() => ({}))) as { code?: unknown };
    const result = attachInvite({
      inviteeId: userId,
      rawCode: typeof body.code === 'string' ? body.code.slice(0, 64) : '',
      now: new Date(now()),
    });
    if (!result.ok) {
      if (result.error === 'invalid_code') limiter.fail(userId, now());
      return c.json(
        { error: result.error, attemptsLeft: limiter.attemptsLeft(userId, now()) },
        result.error === 'invalid_code' ? 404 : 409,
      );
    }
    return c.json(state(userId));
  });

  app.post('/cards/:id/activate', (c) => {
    const userId = getCurrentUserId(c);
    const result = activateCard({
      userId,
      cardId: c.req.param('id'),
      currentPlan: engine.resolveEntitlements(userId).plan,
      hasSubscription: hasSubscription(userId),
      now: new Date(now()),
    });
    if (!result.ok)
      return c.json({ error: result.error }, result.error === 'not_found' ? 404 : 409);
    return c.json({ plan: result.grant.plan, endsAt: result.grant.endsAt });
  });

  return app;
}

export default makeInviteRoutes();
