import '../test-guard';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import path from 'path';
import { db } from '../db';
import app from './library';
import {
  entitlements,
  makeEntitlements,
  parsePlanLimitOverrides,
  setEntitlementsEngineForTests,
  type PlanLimits,
} from '../lib/entitlements';

process.env.LIBRARY_CONTENT_ROOT = path.resolve(
  import.meta.dir,
  '../test-fixtures/library-content',
);
afterAll(() => {
  delete process.env.LIBRARY_CONTENT_ROOT;
});

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
}

const add = (body: unknown) =>
  app.request('/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('library route', () => {
  beforeEach(reset);

  test('lists the books of a language, easiest first, and marks the ones already added', async () => {
    let res = await app.request('/catalog?language=es');
    const first = (await res.json()) as {
      books: Array<{ slug: string; level: string; added: boolean }>;
    };
    expect(first.books.map((b) => b.slug)).toEqual(['cuento-corto', 'cuento-dificil']);
    expect(first.books.every((b) => !b.added)).toBe(true);

    await add({ language: 'es', slug: 'cuento-corto' });
    res = await app.request('/catalog?language=es');
    const second = (await res.json()) as { books: Array<{ slug: string; added: boolean }> };
    expect(second.books.find((b) => b.slug === 'cuento-corto')?.added).toBe(true);
    expect(second.books.find((b) => b.slug === 'cuento-dificil')?.added).toBe(false);
  });

  test('carries the translated titles and blurbs; a book without them gets empty maps', async () => {
    const res = await app.request('/catalog?language=es');
    const { books } = (await res.json()) as {
      books: Array<{
        slug: string;
        titles: Record<string, string>;
        blurbs: Record<string, string>;
      }>;
    };
    const short = books.find((b) => b.slug === 'cuento-corto')!;
    expect(short.titles['zh-CN']).toBe('短故事');
    expect(short.blurbs.en).toBe('A very short story.');
    const hard = books.find((b) => b.slug === 'cuento-dificil')!;
    expect(hard.titles).toEqual({});
    expect(hard.blurbs).toEqual({});
  });

  test('a language with no books returns an empty list; an unknown language is rejected', async () => {
    expect(
      ((await (await app.request('/catalog?language=af')).json()) as { books: unknown[] }).books,
    ).toEqual([]);
    expect((await app.request('/catalog?language=zz')).status).toBe(400);
    expect((await app.request('/catalog')).status).toBe(400);
  });

  test('adding copies the book into a collection with its lessons, once', async () => {
    const res = await add({ language: 'es', slug: 'cuento-corto' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      added: true,
      collectionId: 'library-es-cuento-corto',
      lessonCount: 2,
    });
    const lessons = db
      .prepare(
        "SELECT title, sortOrder FROM lessons WHERE collectionId = 'library-es-cuento-corto' ORDER BY sortOrder",
      )
      .all();
    expect(lessons).toEqual([
      { title: '1. Uno', sortOrder: 0 },
      { title: '2. Dos', sortOrder: 1 },
    ]);

    const again = await add({ language: 'es', slug: 'cuento-corto' });
    expect(await again.json()).toMatchObject({ added: false, reason: 'already-added' });
    expect((db.prepare('SELECT COUNT(*) AS n FROM lessons').get() as { n: number }).n).toBe(2);
  });

  test('rejects a bad body, an unsafe slug and an unknown book', async () => {
    expect((await add('not json')).status).toBe(400);
    expect((await add({ language: 'es', slug: '../etc' })).status).toBe(400);
    expect((await add({ language: 'zz', slug: 'cuento-corto' })).status).toBe(400);
    expect((await add({ language: 'es', slug: 'no-such-book' })).status).toBe(404);
  });

  test('stops with a plan-limit response when the collection does not fit, adding nothing', async () => {
    useLimits({ maxCollections: 0 });
    const res = await add({ language: 'es', slug: 'cuento-corto' });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: 'plan_limit', metric: 'maxCollections' });
    expect((db.prepare('SELECT COUNT(*) AS n FROM collections').get() as { n: number }).n).toBe(0);
  });
});

describe('library lessons and the lesson limits', () => {
  beforeEach(reset);

  const ownerId = () =>
    (db.prepare('SELECT userId FROM collections LIMIT 1').get() as { userId: string }).userId;

  test('an added book does not count toward maxLessons or maxLessonTextBytesTotal', async () => {
    useLimits({ maxLessons: 1, maxLessonTextBytesTotal: 100 });
    const res = await add({ language: 'es', slug: 'cuento-corto' });
    expect(res.status).toBe(200);
    expect(entitlements.checkLimit(ownerId(), 'maxLessons', 1).allowed).toBe(true);
    expect(entitlements.checkLimit(ownerId(), 'maxLessonTextBytesTotal', 100).allowed).toBe(true);
  });

  test('text added to a library lesson beyond its shipped size counts', async () => {
    useLimits({ maxLessonTextBytesTotal: 100 });
    await add({ language: 'es', slug: 'cuento-corto' });
    db.prepare(
      "UPDATE lessons SET textContent = textContent || ? WHERE collectionId = 'library-es-cuento-corto' AND sortOrder = 0",
    ).run('x'.repeat(60));
    expect(entitlements.checkLimit(ownerId(), 'maxLessonTextBytesTotal', 40).allowed).toBe(true);
    expect(entitlements.checkLimit(ownerId(), 'maxLessonTextBytesTotal', 41).allowed).toBe(false);
  });

  test('a lesson with a library-style id that was never shipped still counts', async () => {
    useLimits({ maxLessons: 1 });
    await add({ language: 'es', slug: 'cuento-corto' });
    db.prepare(
      `INSERT INTO lessons (id, collectionId, title, sortOrder, textContent, wordCount, language, createdAt, lastReadAt, userId)
       VALUES ('library-es-lesson-forged', 'library-es-cuento-corto', 'x', 9, 'x', 1, 'es', '', '', ?)`,
    ).run(ownerId());
    expect(entitlements.checkLimit(ownerId(), 'maxLessons', 1).allowed).toBe(false);
  });
});
