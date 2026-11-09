import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { InMemoryExtractionBurstLimiter, type ExtractionBurstLimiter } from '../lib/rate-limit';
import { recordSourceEvent } from '../lib/source-counts';

const MAX_BODY_BYTES = 256;
const BOT_USER_AGENT =
  /bot|crawl|spider|slurp|headless|phantom|lighthouse|curl|wget|python|httpclient/i;

export interface SourceCountRouteDeps {
  limiter: ExtractionBurstLimiter;
  now: () => Date;
}

export function makeSourceCountRoutes(
  deps: SourceCountRouteDeps = {
    limiter: new InMemoryExtractionBurstLimiter({ userPerWindow: 20 }),
    now: () => new Date(),
  },
) {
  const app = new Hono();

  // Public: the visitor has no account yet. Caddy sets X-Forwarded-For to the visitor's address.
  app.post(
    '/',
    bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json({ error: 'too_large' }, 413) }),
    async (c) => {
      const key = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      if (!deps.limiter.tryConsume(`visit:${key}`, null)) {
        return c.json({ error: 'rate_limited' }, 429);
      }

      const body = (await c.req.json().catch(() => null)) as {
        source?: unknown;
        lang?: unknown;
      } | null;
      const userAgent = c.req.header('user-agent') ?? '';
      // A signed-in browser is a returning user, and a bot is not a visitor.
      const skip =
        BOT_USER_AGENT.test(userAgent) || (c.req.header('cookie') ?? '').includes('session_token');
      if (skip) return c.body(null, 204);

      if (!recordSourceEvent('visit', body?.source, body?.lang, deps.now())) {
        return c.json({ error: 'invalid_source' }, 400);
      }
      return c.body(null, 204);
    },
  );

  return app;
}

export default makeSourceCountRoutes();
