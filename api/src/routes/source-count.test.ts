import '../test-guard';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { Database } from 'bun:sqlite';
import { db } from '../db';
import { createAuthEngine, runAuthMigrations, type AuthEngine } from '../lib/accounts';
import { makeBillingMiddleware } from '../lib/billing';
import { InMemoryExtractionBurstLimiter } from '../lib/rate-limit';
import { makeSessionMiddleware } from '../lib/session';
import { makeSourceCountRoutes } from './source-count';

const BASE = 'http://localhost:9999';
let engine: AuthEngine;

function buildApp(limiter = new InMemoryExtractionBurstLimiter({ ipPerWindow: 2 })) {
  const app = new Hono();
  app.use(
    '/api/*',
    makeSessionMiddleware(true, () => engine),
  );
  app.use(
    '/api/*',
    makeBillingMiddleware({ enforced: true, freeTierEnabled: false, exemptEmails: new Set() }),
  );
  app.route('/api/source-count', makeSourceCountRoutes({ limiter, now: () => new Date() }));
  return app;
}

function post(app: Hono, headers: Record<string, string> = {}) {
  return app.request(`${BASE}/api/source-count`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 Safari',
      ...headers,
    },
    body: JSON.stringify({ source: 'google', lang: 'zh' }),
  });
}

function visits(): number {
  const row = db
    .prepare("SELECT COALESCE(SUM(count), 0) AS n FROM source_counts WHERE event = 'visit'")
    .get() as { n: number };
  return row.n;
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

beforeEach(() => {
  db.prepare('DELETE FROM source_counts').run();
});

afterAll(() => {
  db.prepare('DELETE FROM source_counts').run();
});

describe('POST /api/source-count behind the real middleware', () => {
  test('a signed-out request passes the session and billing gates and is counted', async () => {
    const res = await post(buildApp(), { 'x-forwarded-for': '203.0.113.7' });
    expect(res.status).toBe(204);
    expect(visits()).toBe(1);
  });

  test('the limiter caps one address and leaves other addresses alone', async () => {
    const app = buildApp();
    const from = (ip: string) => post(app, { 'x-forwarded-for': ip });
    expect((await from('203.0.113.7')).status).toBe(204);
    expect((await from('203.0.113.7')).status).toBe(204);
    expect((await from('203.0.113.7')).status).toBe(429);
    expect((await from('203.0.113.8')).status).toBe(204);
    expect(visits()).toBe(3);
  });

  test('a path next to it still needs a session', async () => {
    const res = await buildApp().request(`${BASE}/api/source-counts`, { method: 'POST' });
    expect(res.status).toBe(401);
  });
});
