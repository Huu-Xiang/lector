import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { config } from '../lib/config';
import { InMemoryExtractionBurstLimiter } from '../lib/rate-limit';
import { recordProductEvent } from '../lib/product-analytics';
import { parseProductEvent, validProductId } from '../lib/product-events';
import { isTrustedProductOrigin } from '../lib/accounts';

const app = new Hono();
const anonymousLimiter = new InMemoryExtractionBurstLimiter({
  userPerWindow: 1800,
  ipPerWindow: 120,
});
const accountLimiter = new InMemoryExtractionBurstLimiter({
  userPerWindow: 240,
  ipPerWindow: 1200,
});
const bot = /bot|crawl|spider|slurp|headless|lighthouse|curl|wget|python|httpclient/i;

app.use('*', bodyLimit({ maxSize: 2048, onError: (c) => c.json({ error: 'too_large' }, 413) }));

app.post('/public', async (c) => {
  if (!config.authRequired) return c.body(null, 204);
  if (!isTrustedProductOrigin(c.req.header('origin'))) return c.body(null, 403);
  if (c.req.header('content-type')?.split(';')[0] !== 'application/json') return c.body(null, 415);
  if (bot.test(c.req.header('user-agent') ?? '')) return c.body(null, 204);
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!anonymousLimiter.tryConsume('public analytics', ip)) return c.body(null, 429);
  const body = await c.req.json().catch(() => null);
  const event = parseProductEvent(body?.data, true);
  if (!event || !validProductId(body?.key)) return c.body(null, 400);
  return c.body(null, recordProductEvent(event, { key: body.key }) ? 204 : 503);
});

app.post('/', async (c) => {
  if (!config.authRequired) return c.body(null, 204);
  const userId = c.get('userId');
  if (!userId || c.get('tokenId')) return c.body(null, 401);
  if (!isTrustedProductOrigin(c.req.header('origin'))) return c.body(null, 403);
  if (c.req.header('content-type')?.split(';')[0] !== 'application/json') return c.body(null, 415);
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!accountLimiter.tryConsume(userId, ip)) return c.body(null, 429);
  const body = await c.req.json().catch(() => null);
  const event = parseProductEvent(body?.data, false);
  if (!event || !validProductId(body?.key)) return c.body(null, 400);
  return c.body(null, recordProductEvent(event, { userId, key: body.key }) ? 204 : 422);
});

export default app;
