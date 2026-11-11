import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { Hono } from 'hono';
import { db } from '../db';
import { createAuthEngine, runAuthMigrations, type AuthEngine } from './accounts';
import { buildAdminTrends } from './admin-trends';
import { setEmailTransport } from './email';
import { InMemoryExtractionBurstLimiter } from './rate-limit';
import { makeSourceCountRoutes } from '../routes/source-count';
import { LANGS, SOURCES, parseSourceCookie } from './source-list';
import { recordSourceEvent, sourceReport } from './source-counts';

const NOW = new Date('2026-07-20T12:00:00Z');

function counts(): { date: string; source: string; lang: string; event: string; count: number }[] {
  return db
    .prepare(
      'SELECT date, source, lang, event, count FROM source_counts ORDER BY date, source, event, lang',
    )
    .all() as ReturnType<typeof counts>;
}

beforeEach(() => {
  db.prepare('DELETE FROM source_counts').run();
});

describe('source_counts table', () => {
  test('holds no user id, address, referrer or user agent', () => {
    const columns = (
      db.prepare('PRAGMA table_info(source_counts)').all() as { name: string }[]
    ).map((c) => c.name);
    expect(columns).toEqual(['date', 'source', 'lang', 'event', 'count']);
  });
});

describe('recordSourceEvent', () => {
  test('adds one per call, keyed by UTC date, source, lang and event', () => {
    recordSourceEvent('visit', 'google', 'zh', NOW);
    recordSourceEvent('visit', 'google', 'zh', NOW);
    recordSourceEvent('visit', 'google', 'other', NOW);
    recordSourceEvent('signup', 'google', 'zh', NOW);
    recordSourceEvent('visit', 'google', 'zh', new Date('2026-07-21T00:00:01Z'));
    expect(counts()).toEqual([
      { date: '2026-07-20', source: 'google', lang: 'zh', event: 'signup', count: 1 },
      { date: '2026-07-20', source: 'google', lang: 'other', event: 'visit', count: 1 },
      { date: '2026-07-20', source: 'google', lang: 'zh', event: 'visit', count: 2 },
      { date: '2026-07-21', source: 'google', lang: 'zh', event: 'visit', count: 1 },
    ]);
  });

  test('counts every listed source and language', () => {
    for (const source of SOURCES)
      expect(recordSourceEvent('visit', source, 'other', NOW)).toBe(true);
    for (const lang of LANGS) expect(recordSourceEvent('visit', 'direct', lang, NOW)).toBe(true);
    expect(counts().reduce((n, row) => n + row.count, 0)).toBe(SOURCES.length + LANGS.length);
  });

  test('rejects values outside the closed lists and writes nothing', () => {
    expect(recordSourceEvent('visit', 'https://evil.example/?q=1', 'zh', NOW)).toBe(false);
    expect(recordSourceEvent('visit', 'google', 'pl', NOW)).toBe(false);
    expect(recordSourceEvent('visit', undefined, 'zh', NOW)).toBe(false);
    expect(recordSourceEvent('visit', 42, 'zh', NOW)).toBe(false);
    expect(counts()).toEqual([]);
  });
});

describe('parseSourceCookie', () => {
  test('reads source.lang from a Cookie header', () => {
    expect(parseSourceCookie('a=1; rf_src=baidu.zh; b=2')).toEqual(['baidu', 'zh']);
    expect(parseSourceCookie('rf_src=direct.other')).toEqual(['direct', 'other']);
  });

  test('refuses a missing, unknown or malformed value', () => {
    expect(parseSourceCookie(null)).toBeNull();
    expect(parseSourceCookie('a=1')).toBeNull();
    expect(parseSourceCookie('rf_src=evil.zh')).toBeNull();
    expect(parseSourceCookie('rf_src=google.xx')).toBeNull();
    expect(parseSourceCookie('rf_src=google.zh.extra')).toBeNull();
    expect(parseSourceCookie('rf_src=google')).toBeNull();
  });

  test('accepts every source on the list', () => {
    for (const source of SOURCES) {
      expect(parseSourceCookie(`rf_src=${source}.zh`)).toEqual([source, 'zh']);
    }
  });
});

describe('POST /api/source-count', () => {
  function build(limit = 20) {
    const app = new Hono();
    app.route(
      '/api/source-count',
      makeSourceCountRoutes({
        limiter: new InMemoryExtractionBurstLimiter({ ipPerWindow: limit }),
        now: () => NOW,
      }),
    );
    return app;
  }
  const post = (
    app: Hono,
    body: unknown,
    headers: Record<string, string> = {},
    raw: string | null = null,
  ) =>
    app.request('/api/source-count', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.5', ...headers },
      body: raw ?? JSON.stringify(body),
    });

  test('counts a visit without a session', async () => {
    const res = await post(build(), { source: 'xiaohongshu', lang: 'zh' });
    expect(res.status).toBe(204);
    expect(counts()).toEqual([
      { date: '2026-07-20', source: 'xiaohongshu', lang: 'zh', event: 'visit', count: 1 },
    ]);
  });

  test('rejects an unknown source or language', async () => {
    const app = build();
    expect((await post(app, { source: 'evil.example', lang: 'zh' })).status).toBe(400);
    expect((await post(app, { source: 'google', lang: 'pl' })).status).toBe(400);
    expect((await post(app, { source: 'google', lang: 'FR' })).status).toBe(400);
    expect((await post(app, { source: 'Google', lang: 'zh' })).status).toBe(400);
    expect((await post(app, { source: 'news.ycombinator.com', lang: 'en' })).status).toBe(400);
    expect((await post(app, { source: ['google'], lang: 'zh' })).status).toBe(400);
    expect((await post(app, { source: 'google' })).status).toBe(400);
    expect((await post(app, null, {}, 'not json')).status).toBe(400);
    expect(counts()).toEqual([]);
  });

  test('bounds the body size', async () => {
    const res = await post(build(), { source: 'google', lang: 'zh', pad: 'x'.repeat(2000) });
    expect(res.status).toBe(413);
    expect(counts()).toEqual([]);
  });

  test('limits each address, not the whole service', async () => {
    const app = build(2);
    const body = { source: 'google', lang: 'zh' };
    expect((await post(app, body)).status).toBe(204);
    expect((await post(app, body)).status).toBe(204);
    expect((await post(app, body)).status).toBe(429);
    expect((await post(app, body, { 'X-Forwarded-For': '198.51.100.9' })).status).toBe(204);
    expect(counts()[0].count).toBe(3);
  });

  test('skips bots and signed-in browsers without counting', async () => {
    const app = build();
    const body = { source: 'google', lang: 'zh' };
    expect((await post(app, body, { 'User-Agent': 'Googlebot/2.1' })).status).toBe(204);
    expect((await post(app, body, { Cookie: 'better-auth.session_token=abc.def' })).status).toBe(
      204,
    );
    expect(counts()).toEqual([]);
  });
});

describe('signup and session hooks', () => {
  const BASE = 'http://localhost:9999';
  let authDb: Database;
  let engine: AuthEngine;
  let app: Hono;

  beforeAll(async () => {
    setEmailTransport(async () => {});
    authDb = new Database(':memory:');
    engine = createAuthEngine({
      database: authDb,
      baseURL: BASE,
      secret: 'test-secret-000000000000000000000000',
      trustedOrigins: [BASE],
    });
    await runAuthMigrations(engine);
    app = new Hono();
    app.on(['POST', 'GET'], '/api/auth/*', (c) => engine.handler(c.req.raw));
  });

  afterAll(() => setEmailTransport(null));

  const signUp = (email: string, headers: Record<string, string> = {}) =>
    app.request(`${BASE}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ email, password: 'correct-horse-battery1', name: 'Reader' }),
    });

  test('a sign-up with the cookie adds one signup and links it to nobody', async () => {
    const res = await signUp('baidu-reader@example.com', { Cookie: 'rf_src=baidu.zh' });
    expect(res.status).toBe(200);
    expect(counts()).toEqual([
      expect.objectContaining({ source: 'baidu', lang: 'zh', event: 'signup', count: 1 }),
    ]);
  });

  test('a sign-up without a valid cookie adds nothing', async () => {
    expect((await signUp('no-cookie@example.com')).status).toBe(200);
    expect((await signUp('bad-cookie@example.com', { Cookie: 'rf_src=evil.zh' })).status).toBe(200);
    expect(counts()).toEqual([]);
  });

  test('a refused sign-up adds nothing', async () => {
    const weak = await app.request(`${BASE}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: 'rf_src=reddit.other' },
      body: JSON.stringify({ email: 'weak2@example.com', password: 'abc', name: 'W' }),
    });
    expect(weak.status).toBe(400);
    expect(counts().filter((r) => r.source === 'reddit')).toEqual([]);
  });

  test('the session row keeps a shortened address', async () => {
    const email = 'ip-reader@example.com';
    await signUp(email);
    authDb.prepare('UPDATE user SET emailVerified = 1 WHERE email = ?').run(email);
    const signIn = (ip: string) =>
      app.request(`${BASE}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
        body: JSON.stringify({ email, password: 'correct-horse-battery1' }),
      });
    expect((await signIn('203.0.113.77')).status).toBe(200);
    expect((await signIn('2001:db8:1:2:3:4:5:6')).status).toBe(200);
    const rows = authDb
      .prepare(
        'SELECT ipAddress FROM session WHERE userId = (SELECT id FROM user WHERE email = ?) ORDER BY createdAt',
      )
      .all(email) as { ipAddress: string }[];
    expect(rows.map((r) => r.ipAddress)).toEqual(['203.0.113.0', '2001:db8:1::']);
  });
});

describe('admin totals', () => {
  test('sourceReport adds a range and splits by language, busiest source first', () => {
    recordSourceEvent('visit', 'google', 'zh', new Date('2026-07-19T05:00:00Z'));
    recordSourceEvent('visit', 'google', 'other', NOW);
    recordSourceEvent('signup', 'google', 'other', NOW);
    for (let i = 0; i < 3; i++) recordSourceEvent('visit', 'baidu', 'zh', NOW);
    recordSourceEvent('visit', 'reddit', 'other', new Date('2026-06-01T00:00:00Z'));

    const report = sourceReport('2026-07-14', '2026-07-20');
    expect(report.sources).toEqual([
      { source: 'baidu', visits: 3, signups: 0 },
      { source: 'google', visits: 2, signups: 1 },
    ]);
    expect(report.langs.zh).toEqual({ visits: 4, signups: 0 });
    expect(report.langs.other).toEqual({ visits: 1, signups: 1 });
    expect(report.langs.en).toEqual({ visits: 0, signups: 0 });
    expect(Object.keys(report.langs)).toEqual([...LANGS]);
  });

  test('buildAdminTrends carries the totals for its range', () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user (
        id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT,
        emailVerified INTEGER DEFAULT 0, twoFactorEnabled INTEGER DEFAULT 0,
        createdAt TEXT, updatedAt TEXT
      );
    `);
    recordSourceEvent('visit', 'claude', 'other', new Date('2026-07-18T00:00:00Z'));
    recordSourceEvent('visit', 'claude', 'other', new Date('2026-07-01T00:00:00Z'));
    const week = buildAdminTrends(7, NOW, new Set());
    const month = buildAdminTrends(30, NOW, new Set());
    expect(week.sources.sources).toEqual([{ source: 'claude', visits: 1, signups: 0 }]);
    expect(month.sources.sources).toEqual([{ source: 'claude', visits: 2, signups: 0 }]);
  });
});
