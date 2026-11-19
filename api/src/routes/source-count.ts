import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { InMemoryExtractionBurstLimiter, type ExtractionBurstLimiter } from '../lib/rate-limit';
import { recordSourceEvent } from '../lib/source-counts';
import { isTrustedProductOrigin } from '../lib/accounts';
import { ignoreAnonymousAnalytics } from '../lib/analytics-traffic';

const MAX_BODY_BYTES = 256;

export interface SourceCountRouteDeps {
  limiter: ExtractionBurstLimiter;
  now: () => Date;
  trustedOrigin?: (origin: string | undefined) => boolean;
}

export function makeSourceCountRoutes(
  deps: SourceCountRouteDeps = {
    limiter: new InMemoryExtractionBurstLimiter({ userPerWindow: 600, ipPerWindow: 20 }),
    now: () => new Date(),
  },
) {
  const app = new Hono();

  // Public: the visitor has no account yet. Caddy sets X-Forwarded-For to the visitor's address.
  app.post(
    '/',
    bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json({ error: 'too_large' }, 413) }),
    async (c) => {
      const origin = c.req.header('origin');
      if (!origin || !(deps.trustedOrigin ?? isTrustedProductOrigin)(origin))
        return c.body(null, 403);
      if (c.req.header('content-type')?.split(';')[0] !== 'application/json')
        return c.body(null, 415);
      if (
        ignoreAnonymousAnalytics(c.req.raw.headers) ||
        (c.req.header('cookie') ?? '').includes('session_token')
      )
        return c.body(null, 204);
      const key = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      // The limiter's user key is one shared site-wide bucket; the visitor address gets its own.
      if (!deps.limiter.tryConsume('visit', key)) {
        return c.json({ error: 'rate_limited' }, 429);
      }

      const body = (await c.req.json().catch(() => null)) as {
        source?: unknown;
        lang?: unknown;
      } | null;
      if (!recordSourceEvent('visit', body?.source, body?.lang, deps.now())) {
        return c.json({ error: 'invalid_source' }, 400);
      }
      return c.body(null, 204);
    },
  );

  return app;
}

export default makeSourceCountRoutes();
