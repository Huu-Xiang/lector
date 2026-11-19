import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { config } from '../lib/config';
import { InMemoryExtractionBurstLimiter, type ExtractionBurstLimiter } from '../lib/rate-limit';
import { recordProductEvent } from '../lib/product-analytics';
import { parseProductEvent, validProductId } from '../lib/product-events';
import { isTrustedProductOrigin } from '../lib/accounts';
import { ignoreAnonymousAnalytics } from '../lib/analytics-traffic';

export interface ProductAnalyticsRouteDeps {
  authRequired: boolean;
  trustedOrigin: (origin: string | undefined) => boolean;
  anonymousLimiter: ExtractionBurstLimiter;
  accountLimiter: ExtractionBurstLimiter;
  recordEvent: typeof recordProductEvent;
}

export function makeProductAnalyticsRoutes(overrides: Partial<ProductAnalyticsRouteDeps> = {}) {
  const deps: ProductAnalyticsRouteDeps = {
    authRequired: config.authRequired,
    trustedOrigin: isTrustedProductOrigin,
    anonymousLimiter: new InMemoryExtractionBurstLimiter({ userPerWindow: 1800, ipPerWindow: 120 }),
    accountLimiter: new InMemoryExtractionBurstLimiter({ userPerWindow: 240, ipPerWindow: 1200 }),
    recordEvent: recordProductEvent,
    ...overrides,
  };
  const app = new Hono();

  app.use('*', bodyLimit({ maxSize: 2048, onError: (c) => c.json({ error: 'too_large' }, 413) }));

  app.post('/public', async (c) => {
    if (!deps.authRequired) return c.body(null, 204);
    const origin = c.req.header('origin');
    if (!origin || !deps.trustedOrigin(origin)) return c.body(null, 403);
    if (c.req.header('content-type')?.split(';')[0] !== 'application/json')
      return c.body(null, 415);
    if (ignoreAnonymousAnalytics(c.req.raw.headers)) return c.body(null, 204);
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!deps.anonymousLimiter.tryConsume('public analytics', ip)) return c.body(null, 429);
    const body = await c.req.json().catch(() => null);
    const event = parseProductEvent(body?.data, true);
    if (!event || !validProductId(body?.key)) return c.body(null, 400);
    return c.body(null, deps.recordEvent(event, { key: body.key }) ? 204 : 503);
  });

  app.post('/', async (c) => {
    if (!deps.authRequired) return c.body(null, 204);
    const userId = c.get('userId');
    if (!userId || c.get('tokenId')) return c.body(null, 401);
    if (!deps.trustedOrigin(c.req.header('origin'))) return c.body(null, 403);
    if (c.req.header('content-type')?.split(';')[0] !== 'application/json')
      return c.body(null, 415);
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!deps.accountLimiter.tryConsume(userId, ip)) return c.body(null, 429);
    const body = await c.req.json().catch(() => null);
    const event = parseProductEvent(body?.data, false);
    if (!event || !validProductId(body?.key)) return c.body(null, 400);
    return c.body(null, deps.recordEvent(event, { userId, key: body.key }) ? 204 : 422);
  });

  return app;
}

export default makeProductAnalyticsRoutes();
