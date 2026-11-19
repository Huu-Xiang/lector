import '../test-guard';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { Database } from 'bun:sqlite';
import { db } from '../db';
import { createAuthEngine, runAuthMigrations, type AuthEngine } from '../lib/accounts';
import { makeBillingMiddleware } from '../lib/billing';
import { InMemoryExtractionBurstLimiter } from '../lib/rate-limit';
import { recordProductEvent } from '../lib/product-analytics';
import { makeSessionMiddleware } from '../lib/session';
import { makeProductAnalyticsRoutes } from './product-analytics';

const BASE = 'http://localhost:9999';
const USER = 'analytics-traffic-test-user';
let engine: AuthEngine;

function buildApp(limit = 120) {
  const app = new Hono();
  app.use(
    '/api/*',
    makeSessionMiddleware(true, () => engine),
  );
  app.use(
    '/api/*',
    makeBillingMiddleware({ enforced: true, freeTierEnabled: false, exemptEmails: new Set() }),
  );
  app.route(
    '/api/product-analytics',
    makeProductAnalyticsRoutes({
      authRequired: true,
      trustedOrigin: (origin) => origin === BASE,
      anonymousLimiter: new InMemoryExtractionBurstLimiter({ ipPerWindow: limit }),
      recordEvent: (event, options) => recordProductEvent(event, { ...options, database: db }),
    }),
  );
  return app;
}

function post(
  app: Hono,
  headers: Record<string, string> = {},
  body: unknown = { data: { event: 'page_view', feature: 'register' }, key: 'public-page-1' },
  path = '/api/product-analytics/public',
) {
  return app.request(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 Chrome/149.0.0.0 Safari/537.36',
      Origin: BASE,
      'x-readfox-engaged': '1',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function total(): number {
  return (db.query('SELECT coalesce(sum(count),0) n FROM product_daily').get() as { n: number }).n;
}

function clearAnalytics() {
  for (const table of ['product_daily', 'product_events', 'product_receipts'])
    db.run(`DELETE FROM ${table}`);
}

beforeAll(async () => {
  engine = createAuthEngine({
    database: new Database(':memory:'),
    baseURL: BASE,
    secret: 'test-secret-000000000000000000000000',
    trustedOrigins: [BASE],
  });
  await runAuthMigrations(engine);
});

beforeEach(clearAnalytics);

afterAll(clearAnalytics);

describe('public product analytics behind session and billing middleware', () => {
  test('counts an engaged anonymous page once across retries without account-linked rows', async () => {
    const app = buildApp();
    expect((await post(app)).status).toBe(204);
    expect((await post(app)).status).toBe(204);
    expect(total()).toBe(1);
    expect(db.query('SELECT count(*) n FROM product_events').get()).toEqual({ n: 0 });
  });

  test('ignores missing and invalid engagement signals', async () => {
    const app = buildApp();
    expect((await post(app, { 'x-readfox-engaged': '' })).status).toBe(204);
    expect((await post(app, { 'x-readfox-engaged': 'true' })).status).toBe(204);
    expect(total()).toBe(0);
  });

  test.each([
    'Googlebot/2.1',
    'meta-externalagent/1.1',
    'meta-externalfetcher/1.1',
    'Go-http-client/1.1',
    'HeadlessChrome/149',
    'prerender',
    'curl/8.0',
  ])('ignores identifiable automation %s even with the engagement header', async (agent) => {
    expect((await post(buildApp(), { 'User-Agent': agent })).status).toBe(204);
    expect(total()).toBe(0);
  });

  test('rejects missing and untrusted origins and non-JSON requests', async () => {
    const app = buildApp();
    expect((await post(app, { Origin: '' })).status).toBe(403);
    expect((await post(app, { Origin: 'https://untrusted.example' })).status).toBe(403);
    expect((await post(app, { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect(total()).toBe(0);
  });

  test('rejects private fields and authenticated-only events at the public endpoint', async () => {
    const app = buildApp();
    expect(
      (
        await post(
          app,
          {},
          {
            data: { event: 'page_view', feature: 'register', email: 'private@example.test' },
            key: 'bad-fields',
          },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await post(
          app,
          {},
          {
            data: { event: 'reading_started', language: 'en', lessonId: 'private-lesson' },
            key: 'not-public',
          },
        )
      ).status,
    ).toBe(400);
    expect(total()).toBe(0);
  });

  test('rate limits engaged events while ignored traffic does not consume the budget', async () => {
    const app = buildApp(1);
    expect((await post(app, { 'x-readfox-engaged': '' })).status).toBe(204);
    expect((await post(app)).status).toBe(204);
    expect((await post(app)).status).toBe(429);
    expect(total()).toBe(1);
  });

  test('still requires a session on the authenticated analytics endpoint', async () => {
    expect((await post(buildApp(), {}, undefined, '/api/product-analytics')).status).toBe(401);
    expect(total()).toBe(0);
  });
});

describe('authenticated analytics engagement contract', () => {
  function accountApp(tokenId?: string) {
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('userId', USER);
      c.set('tokenId', tokenId);
      await next();
    });
    app.route(
      '/api/product-analytics',
      makeProductAnalyticsRoutes({
        authRequired: true,
        trustedOrigin: (origin) => origin === BASE,
        recordEvent: (event, options) => recordProductEvent(event, { ...options, database: db }),
      }),
    );
    return app;
  }

  test('keeps authenticated browser events working without the anonymous engagement header', async () => {
    expect(
      (await post(accountApp(), { 'x-readfox-engaged': '' }, undefined, '/api/product-analytics'))
        .status,
    ).toBe(204);
    expect(total()).toBe(1);
    expect(db.query('SELECT count(*) n FROM product_events').get()).toEqual({ n: 1 });
  });

  test('does not allow personal access tokens to report browser events', async () => {
    expect(
      (await post(accountApp('token-1'), {}, undefined, '/api/product-analytics')).status,
    ).toBe(401);
    expect(total()).toBe(0);
  });
});
