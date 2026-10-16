import '../test-guard';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { db } from '../db';
import app from './reading-feed';
import { pruneReadingFeed, upsertReadingFeedArticle } from '../lib/reading-feed/store';
import {
  makeEntitlements,
  parsePlanLimitOverrides,
  setEntitlementsEngineForTests,
  type PlanLimits,
} from '../lib/entitlements';

let restoreEngine: (() => void) | null = null;
afterEach(() => {
  restoreEngine?.();
  restoreEngine = null;
});

function useLimits(overrides: Partial<PlanLimits>) {
  const defaults = parsePlanLimitOverrides(undefined);
  restoreEngine = setEntitlementsEngineForTests(
    makeEntitlements({
      enforced: true,
      freeTierEnabled: true,
      exemptEmails: new Set(),
      prices: [],
      planLimits: { ...defaults, free: { ...defaults.free, ...overrides } },
      resolveEmail: () => null,
      isByok: () => false,
      compedPlan: () => null,
      now: () => new Date('2026-07-15T12:00:00Z'),
    }),
  );
}

function reset() {
  db.prepare('DELETE FROM lessons').run();
  db.prepare('DELETE FROM collections').run();
  db.prepare('DELETE FROM reading_feed').run();
}

function seedArticle() {
  upsertReadingFeedArticle({
    language: 'en',
    interest: 'news',
    source: 'global-voices',
    title: 'Test Article',
    url: 'https://example.com/test-article',
    author: null,
    license: 'CC BY 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
    publishedAt: '2026-01-01T00:00:00.000Z',
    text: 'word '.repeat(300),
    wordCount: 300,
    level: 'B1',
    fetchedAt: '2026-01-01T00:00:00.000Z',
  });
  return db
    .prepare("SELECT id FROM reading_feed WHERE url = 'https://example.com/test-article'")
    .get() as { id: string };
}

const addArticle = (body: unknown) =>
  app.request('/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('reading-feed route', () => {
  beforeEach(reset);

  test('lists articles for a language and interest without the full text', async () => {
    seedArticle();
    const res = await app.request('/?language=en&interest=news');
    const { articles } = (await res.json()) as {
      articles: Array<{ title: string; text?: string; wordCount: number; level: string }>;
    };
    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe('Test Article');
    expect(articles[0].wordCount).toBe(300);
    expect(articles[0].level).toBe('B1');
    expect(articles[0].text).toBeUndefined();
  });

  test('rejects an unknown language or interest', async () => {
    expect((await app.request('/?language=zz&interest=news')).status).toBe(400);
    expect((await app.request('/?language=en&interest=sports')).status).toBe(400);
  });

  test('adding copies the article into a collection with an attribution block, once', async () => {
    const { id } = seedArticle();
    const res = await addArticle({ id });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ added: true });

    const lesson = db
      .prepare('SELECT textContent FROM lessons WHERE collectionId = ?')
      .get(`reading-feed-${id}`) as { textContent: string };
    expect(lesson.textContent).toContain('Source: global-voices');
    expect(lesson.textContent).toContain('https://example.com/test-article');
    expect(lesson.textContent).toContain('CC BY 3.0');
    expect(lesson.textContent).toContain('Changes: text extracted');

    const again = await addArticle({ id });
    expect(await again.json()).toMatchObject({ added: false, reason: 'already-added' });
    expect((db.prepare('SELECT COUNT(*) AS n FROM lessons').get() as { n: number }).n).toBe(1);
  });

  test('rejects a bad body and an unknown article', async () => {
    expect((await addArticle('not json')).status).toBe(400);
    expect((await addArticle({ id: 'no-such-id' })).status).toBe(404);
  });

  test('stops with a plan-limit response when the lesson does not fit, adding nothing', async () => {
    const { id } = seedArticle();
    useLimits({ maxLessons: 0 });
    const res = await addArticle({ id });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: 'plan_limit', metric: 'maxLessons' });
    expect((db.prepare('SELECT COUNT(*) AS n FROM collections').get() as { n: number }).n).toBe(0);
  });
});

describe('POST /describe', () => {
  const post = (body: unknown) =>
    app.request('/describe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  test('validates the native language and the id list', async () => {
    expect((await post({ ids: ['x'], native: 'xx' })).status).toBe(400);
    expect((await post({ ids: [], native: 'zh-CN' })).status).toBe(400);
    expect((await post({ ids: Array(13).fill('x'), native: 'zh-CN' })).status).toBe(400);
  });

  test('returns nothing for unknown ids and for an article already in the reader language', async () => {
    reset();
    const { id } = seedArticle();
    const res = await post({ ids: ['missing', id], native: 'en' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ descriptions: {} });
  });
});

describe('describe for an article that left the feed', () => {
  test('serves the stored description and prune keeps it while a collection holds the article', async () => {
    reset();
    db.prepare('DELETE FROM reading_feed_summary').run();
    const { id } = seedArticle();
    db.prepare(
      "INSERT INTO reading_feed_summary (articleId, native, title, summary, createdAt) VALUES (?, 'zh-CN', '标题', '简介', '2026-01-01')",
    ).run(id);
    db.prepare(
      `INSERT INTO collections (id, title, author, language, createdAt, lastReadAt, userId)
       VALUES (?, 'Test Article', 'x', 'en', '2026-01-01', '2026-01-01', 'local')`,
    ).run(`reading-feed-${id}`);
    db.prepare('DELETE FROM reading_feed').run();
    pruneReadingFeed('en', 'news');

    const res = await app.request('/describe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id], native: 'zh-CN' }),
    });
    expect(await res.json()).toEqual({
      descriptions: { [id]: { title: '标题', summary: '简介' } },
    });

    db.prepare('DELETE FROM collections').run();
    pruneReadingFeed('en', 'news');
    expect(db.prepare('SELECT COUNT(*) AS n FROM reading_feed_summary').get()).toEqual({ n: 0 });
  });
});
