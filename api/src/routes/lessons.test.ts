import '../test-guard';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'fs';
import { AUDIO_DIR, db } from '../db';
import { ConcurrencyGate } from '../lib/concurrency-gate';
import { InMemorySearchBurstLimiter } from '../lib/rate-limit';
import app, { makeLessonsRoutes } from './lessons';

const TS = '2026-01-01T00:00:00Z';

function reset() {
  db.prepare('DELETE FROM vocab').run();
  db.prepare('DELETE FROM lessons').run();
  db.prepare('DELETE FROM collections').run();
}

function seedLesson() {
  db.prepare(
    `INSERT INTO collections (id, title, author, language, createdAt, lastReadAt, userId)
     VALUES ('collection-1', 'Collection', 'Unknown', 'af', ?, ?, 'local')`,
  ).run(TS, TS);
  db.prepare(
    `INSERT INTO lessons
      (id, collectionId, title, textContent, language, createdAt, lastReadAt, userId)
     VALUES ('lesson-1', 'collection-1', 'Lesson', '', 'af', ?, ?, 'local')`,
  ).run(TS, TS);
}

describe('lessons route', () => {
  beforeEach(reset);
  afterEach(reset);

  test('DELETE /:id retains vocabulary and clears its source lesson', async () => {
    seedLesson();
    db.prepare(
      `INSERT INTO vocab
        (id, text, type, sentence, translation, state, stateUpdatedAt, bookId, language, createdAt, userId)
       VALUES ('word-1', 'huis', 'word', '', '', 'new', ?, 'lesson-1', 'af', ?, 'local')`,
    ).run(TS, TS);

    const response = await app.request('/lesson-1?language=af', { method: 'DELETE' });

    expect(response.status).toBe(200);
    expect(db.prepare("SELECT COUNT(*) AS n FROM lessons WHERE id = 'lesson-1'").get()).toEqual({
      n: 0,
    });
    expect(db.prepare("SELECT bookId FROM vocab WHERE id = 'word-1'").get()).toEqual({
      bookId: null,
    });
  });

  test('PUT /:id normalizes text and recomputes word count', async () => {
    seedLesson();

    const response = await app.request('/lesson-1?language=af', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collectionId: 'collection-1',
        title: 'Cafe\u0301',
        textContent: 'Een twee drie.',
        sortOrder: 2,
      }),
    });

    expect(response.status).toBe(200);
    expect(
      db
        .prepare(
          "SELECT title, textContent, wordCount, sortOrder FROM lessons WHERE id = 'lesson-1'",
        )
        .get(),
    ).toEqual({
      title: 'Café',
      textContent: 'Een twee drie.',
      wordCount: 3,
      sortOrder: 2,
    });
  });

  test('PUT /:id rejects a collection owned by another tenant without mutating the lesson', async () => {
    seedLesson();
    db.prepare(
      `INSERT INTO collections (id, title, author, language, createdAt, lastReadAt, userId)
       VALUES ('foreign-collection', 'Private', 'Other', 'af', ?, ?, 'lessons-intruder')`,
    ).run(TS, TS);

    const response = await app.request('/lesson-1?language=af', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collectionId: 'foreign-collection', title: 'Changed' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'collectionId must reference one of your collections',
    });
    expect(db.prepare("SELECT title FROM lessons WHERE id = 'lesson-1'").get()).toEqual({
      title: 'Lesson',
    });
  });

  test('PUT /:id/progress validates bounds, updates the lesson, and touches its collection', async () => {
    seedLesson();

    const invalid = await app.request('/lesson-1/progress?language=af', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scrollPosition: -1, percentComplete: 101 }),
    });
    expect(invalid.status).toBe(400);

    const response = await app.request('/lesson-1/progress?language=af', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scrollPosition: 450, percentComplete: 62.5 }),
    });

    expect(response.status).toBe(200);
    expect(
      db
        .prepare(
          "SELECT progress_scrollPosition, progress_percentComplete FROM lessons WHERE id = 'lesson-1'",
        )
        .get(),
    ).toEqual({ progress_scrollPosition: 450, progress_percentComplete: 62.5 });
    expect(
      (
        db.prepare("SELECT lastReadAt FROM collections WHERE id = 'collection-1'").get() as {
          lastReadAt: string;
        }
      ).lastReadAt,
    ).not.toBe(TS);

    const missing = await app.request('/missing/progress?language=af', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scrollPosition: 0, percentComplete: 0 }),
    });
    expect(missing.status).toBe(404);
  });
});

describe('GET /:id/readings (#289 4.4)', () => {
  beforeEach(reset);
  afterEach(reset);

  // A language with no `annotation` in its pronunciation config opts out. It
  // must answer 200 with nothing, so the reader can call this for any lesson
  // without first knowing which languages support it.
  test('returns nothing for a language that declares no annotation source', async () => {
    seedLesson();

    const response = await app.request('/lesson-1/readings?language=af');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
  });

  test('404 for an unknown lesson', async () => {
    const response = await app.request('/missing/readings?language=af');

    expect(response.status).toBe(404);
  });
});

describe('audio lesson routes (#185)', () => {
  beforeEach(() => {
    reset();
    db.prepare('DELETE FROM transcript_segments').run();
  });
  afterEach(() => {
    reset();
    db.prepare('DELETE FROM transcript_segments').run();
  });

  async function seedAudioLesson(status = 'done'): Promise<string> {
    const audioPath = `${AUDIO_DIR}/lesson-1.mp3`;
    await Bun.write(
      audioPath,
      new Uint8Array(100).map((_, i) => i),
    );
    seedLesson();
    db.prepare(
      `UPDATE lessons SET audioPath = ?, audioDurationMs = 14000, transcriptionStatus = ? WHERE id = 'lesson-1'`,
    ).run(audioPath, status);
    db.prepare(
      `INSERT INTO transcript_segments (userId, lessonId, idx, startMs, endMs, text)
       VALUES ('local', 'lesson-1', 0, 0, 2000, 'Goeie môre.'),
              ('local', 'lesson-1', 1, 2000, 4000, 'Welkom terug.')`,
    ).run();
    return audioPath;
  }

  test('GET /:id/segments returns ordered segments; 404 for unknown lesson', async () => {
    await seedAudioLesson();

    const response = await app.request('/lesson-1/segments?language=af');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      { idx: 0, startMs: 0, endMs: 2000, text: 'Goeie môre.' },
      { idx: 1, startMs: 2000, endMs: 4000, text: 'Welkom terug.' },
    ]);

    const missing = await app.request('/missing/segments?language=af');
    expect(missing.status).toBe(404);
  });

  test('GET /:id/audio serves the full file with Accept-Ranges', async () => {
    await seedAudioLesson();

    const response = await app.request('/lesson-1/audio?language=af');
    expect(response.status).toBe(200);
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    expect(response.headers.get('Content-Type')).toBe('audio/mpeg');
    expect((await response.arrayBuffer()).byteLength).toBe(100);
  });

  test('GET /:id/audio honours Range with 206 + Content-Range (seek survives)', async () => {
    await seedAudioLesson();

    const response = await app.request('/lesson-1/audio?language=af', {
      headers: { Range: 'bytes=10-19' },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 10-19/100');
    const body = new Uint8Array(await response.arrayBuffer());
    expect(body.length).toBe(10);
    expect(body[0]).toBe(10);

    // Suffix form: the last N bytes.
    const suffix = await app.request('/lesson-1/audio?language=af', {
      headers: { Range: 'bytes=-5' },
    });
    expect(suffix.status).toBe(206);
    expect(suffix.headers.get('Content-Range')).toBe('bytes 95-99/100');

    const unsatisfiable = await app.request('/lesson-1/audio?language=af', {
      headers: { Range: 'bytes=200-300' },
    });
    expect(unsatisfiable.status).toBe(416);
    expect(unsatisfiable.headers.get('Content-Range')).toBe('bytes */100');
  });

  test('GET /:id/audio 404s for a text lesson', async () => {
    seedLesson();
    const response = await app.request('/lesson-1/audio?language=af');
    expect(response.status).toBe(404);
  });

  test('POST /:id/retry-transcription re-queues only failed lessons', async () => {
    await seedAudioLesson('error');
    db.prepare(
      "UPDATE lessons SET transcriptionError = 'boom', transcriptionAttempts = 3 WHERE id = 'lesson-1'",
    ).run();

    const response = await app.request('/lesson-1/retry-transcription?language=af', {
      method: 'POST',
    });
    expect(response.status).toBe(200);
    expect(
      db
        .prepare(
          "SELECT transcriptionStatus, transcriptionError, transcriptionAttempts FROM lessons WHERE id = 'lesson-1'",
        )
        .get(),
    ).toEqual({
      transcriptionStatus: 'pending',
      transcriptionError: null,
      transcriptionAttempts: 0,
    });

    // Not retryable once it's no longer in error state.
    const again = await app.request('/lesson-1/retry-transcription?language=af', {
      method: 'POST',
    });
    expect(again.status).toBe(404);
  });

  test('DELETE /:id removes segments and unlinks the audio file', async () => {
    const audioPath = await seedAudioLesson();
    expect(fs.existsSync(audioPath)).toBe(true);

    const response = await app.request('/lesson-1?language=af', { method: 'DELETE' });
    expect(response.status).toBe(200);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM transcript_segments WHERE lessonId = 'lesson-1'").get(),
    ).toEqual({ n: 0 });
    expect(fs.existsSync(audioPath)).toBe(false);
  });
});

describe('GET /search (concordance search, R10 / AE5)', () => {
  function resetSearch() {
    reset();
    db.prepare('DELETE FROM collection_groups').run();
  }

  beforeEach(resetSearch);
  afterEach(resetSearch);

  function seedSearchCorpus() {
    // Tenant 'local' groups & collections (German + French)
    db.prepare(
      `INSERT INTO collection_groups (id, name, sortOrder, createdAt, userId)
       VALUES ('grp-news', 'News', 0, ?, 'local'),
              ('grp-fiction', 'Fiction', 1, ?, 'local')`,
    ).run(TS, TS);
    db.prepare(
      `INSERT INTO collections (id, title, author, groupId, language, createdAt, lastReadAt, userId)
       VALUES ('col-news', 'Tagesschau', 'ARD', 'grp-news', 'de', ?, ?, 'local'),
              ('col-fiction', 'Märchen', 'Grimm', 'grp-fiction', 'de', ?, ?, 'local'),
              ('col-ungrouped', 'Notizen', 'Me', NULL, 'de', ?, ?, 'local'),
              ('col-fr', 'Le Monde', 'FR', 'grp-news', 'fr', ?, ?, 'local')`,
    ).run(TS, TS, TS, TS, TS, TS, TS, TS);
    db.prepare(
      `INSERT INTO lessons
        (id, collectionId, title, textContent, language, createdAt, lastReadAt, userId)
       VALUES
        ('lesson-a', 'col-news', 'Artikel 1', '# Häuser\n\nAlte Häuser\nstehen am Fluss.', 'de', ?, '2026-01-03T00:00:00Z', 'local'),
        ('lesson-b', 'col-fiction', 'Kapitel 1', 'Wir sehen viele häuser in der Stadt.', 'de', ?, '2026-01-02T00:00:00Z', 'local'),
        ('lesson-u', 'col-ungrouped', 'Notiz 1', 'Diese Häuser sind neu.', 'de', ?, '2026-01-01T00:00:00Z', 'local'),
        ('lesson-fr', 'col-fr', 'Article FR', 'Les Häuser en Allemagne.', 'fr', ?, '2026-01-04T00:00:00Z', 'local')`,
    ).run(TS, TS, TS, TS);

    // Second tenant 'other-user' using IDENTICAL collectionId ('col-news') and groupId ('grp-news') + private group
    db.prepare(
      `INSERT INTO collection_groups (id, name, sortOrder, createdAt, userId)
       VALUES ('grp-news', 'Other News', 0, ?, 'other-user'),
              ('grp-secret', 'Secret Group', 1, ?, 'other-user')`,
    ).run(TS, TS);
    db.prepare(
      `INSERT INTO collections (id, title, author, groupId, language, createdAt, lastReadAt, userId)
       VALUES ('col-news', 'Private News', 'Other', 'grp-news', 'de', ?, ?, 'other-user'),
              ('col-secret', 'Private Secret', 'Other', 'grp-secret', 'de', ?, ?, 'other-user')`,
    ).run(TS, TS, TS, TS);
    db.prepare(
      `INSERT INTO lessons
        (id, collectionId, title, textContent, language, createdAt, lastReadAt, userId)
       VALUES
        ('other-lesson-1', 'col-news', 'Secret 1', 'Geheime Häuser gehören nicht dir.', 'de', ?, ?, 'other-user'),
        ('other-lesson-2', 'col-secret', 'Secret 2', 'Versteckte Häuser im Wald.', 'de', ?, ?, 'other-user')`,
    ).run(TS, TS, TS, TS);
  }

  test('searches active language, folds case/diacritics, filters by groupId/ungrouped/collectionId, and isolates tenants', async () => {
    seedSearchCorpus();
    const routes = makeLessonsRoutes();

    // All library (German only — excludes French and excludes other-user even with identical col-news/grp-news IDs)
    const allRes = await routes.request('/search?q=h%C3%A4user&language=de');
    expect(allRes.status).toBe(200);
    const allBody = (await allRes.json()) as {
      query: string;
      truncated: boolean;
      matches: Array<{
        lessonId: string;
        groupName: string | null;
        collectionTitle: string | null;
        snippet: string;
      }>;
    };
    expect(allBody.query).toBe('häuser');
    expect(allBody.truncated).toBe(false);
    expect(allBody.matches.map((m) => m.lessonId)).toEqual([
      'lesson-a',
      'lesson-a',
      'lesson-b',
      'lesson-u',
    ]);
    expect(allBody.matches[0].groupName).toBe('News');
    expect(allBody.matches[0].collectionTitle).toBe('Tagesschau');

    // Filter to News group only
    const newsRes = await routes.request('/search?q=h%C3%A4user&language=de&groupId=grp-news');
    expect(newsRes.status).toBe(200);
    const newsBody = (await newsRes.json()) as { matches: Array<{ lessonId: string }> };
    expect(newsBody.matches.map((m) => m.lessonId)).toEqual(['lesson-a', 'lesson-a']);

    // Filter to ungrouped only
    const ungroupedRes = await routes.request('/search?q=h%C3%A4user&language=de&groupId=ungrouped');
    expect(ungroupedRes.status).toBe(200);
    const ungroupedBody = (await ungroupedRes.json()) as { matches: Array<{ lessonId: string }> };
    expect(ungroupedBody.matches.map((m) => m.lessonId)).toEqual(['lesson-u']);

    // Filter to another tenant's groupId returns empty results
    const foreignGroupRes = await routes.request(
      '/search?q=h%C3%A4user&language=de&groupId=grp-secret',
    );
    expect(foreignGroupRes.status).toBe(200);
    expect(((await foreignGroupRes.json()) as { matches: unknown[] }).matches).toEqual([]);

    // Filter to a specific collectionId
    const colRes = await routes.request('/search?q=h%C3%A4user&language=de&collectionId=col-fiction');
    expect(colRes.status).toBe(200);
    const colBody = (await colRes.json()) as { matches: Array<{ lessonId: string }> };
    expect(colBody.matches.map((m) => m.lessonId)).toEqual(['lesson-b']);
  });

  test('validates q (1..200 chars) and limit, and returns 400 on invalid inputs', async () => {
    const routes = makeLessonsRoutes();
    expect((await routes.request('/search?language=de')).status).toBe(400);
    expect((await routes.request('/search?q=%20%20&language=de')).status).toBe(400);
    expect((await routes.request(`/search?q=${'a'.repeat(201)}&language=de`)).status).toBe(400);
    expect((await routes.request('/search?q=haus&limit=0&language=de')).status).toBe(400);
    expect((await routes.request('/search?q=haus&limit=abc&language=de')).status).toBe(400);
  });

  test('returns YouTube segmentIndex and startMs without leaking raw JSON', async () => {
    seedSearchCorpus();
    db.prepare(
      `INSERT INTO lessons
        (id, collectionId, title, textContent, sourceType, segments, language, createdAt, lastReadAt, userId)
       VALUES
        ('yt-de', 'col-news', 'Video', 'Guten Tag\nSchöne Häuser', 'youtube', ?, 'de', ?, '2026-01-05T00:00:00Z', 'local')`,
    ).run(
      JSON.stringify([
        { start: 0, end: 2, text: 'Guten Tag' },
        { start: 5.5, end: 8.0, text: 'Schöne Häuser' },
      ]),
      TS,
    );

    const routes = makeLessonsRoutes();
    const res = await routes.request('/search?q=h%C3%A4user&language=de&collectionId=col-news');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      matches: Array<{ lessonId: string; segmentIndex?: number; startMs?: number; snippet: string }>;
    };
    const ytMatch = body.matches.find((m) => m.lessonId === 'yt-de');
    expect(ytMatch).toMatchObject({
      lessonId: 'yt-de',
      segmentIndex: 1,
      startMs: 5500,
      snippet: 'Schöne Häuser',
    });
  });

  test('enforces per-user burst rate limit (429) and concurrency gate (503)', async () => {
    seedSearchCorpus();
    const limiter = new InMemorySearchBurstLimiter({ userPerWindow: 2 });
    const limitedRoutes = makeLessonsRoutes({ searchLimiter: limiter });

    expect((await limitedRoutes.request('/search?q=h%C3%A4user&language=de')).status).toBe(200);
    expect((await limitedRoutes.request('/search?q=h%C3%A4user&language=de')).status).toBe(200);
    const third = await limitedRoutes.request('/search?q=h%C3%A4user&language=de');
    expect(third.status).toBe(429);
    expect(third.headers.get('Retry-After')).toBe('60');

    const gate = new ConcurrencyGate(1, 1);
    const release = gate.tryEnter('local');
    expect(release).not.toBeNull();
    try {
      const gatedRoutes = makeLessonsRoutes({ searchGate: gate });
      const busy = await gatedRoutes.request('/search?q=h%C3%A4user&language=de');
      expect(busy.status).toBe(503);
    } finally {
      release?.();
    }
  });
});
