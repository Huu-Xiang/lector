import { Hono } from 'hono';
import { createHash } from 'crypto';
import { db } from '../db';
import { getCurrentUserId } from '../lib/user';
import { LANGUAGES, isValidLanguageCode } from '../lib/languages';
import { countWords } from '../lib/html-to-markdown';
import { segmentWordsFor } from '../lib/segment-words';
import { isLibrarySlug, listLibraryBooks, loadLibraryBook } from '../lib/library-content';
import { entitlements, planLimitResponse, type AtomicLimitCheck } from '../lib/entitlements';
import { collectionMetadataBytes, lessonTextBytes } from '../lib/storage-limits';

// Free library: browse the public-domain books of a language and copy one into
// the learner's own collections. Adding is idempotent per user and book.

const app = new Hono();

const collectionIdFor = (language: string, slug: string) => `library-${language}-${slug}`;

function lessonIdFor(language: string, slug: string, sourceFile: string): string {
  const digest = createHash('sha256').update(`${slug}/${sourceFile}`).digest('hex');
  return `library-${language}-lesson-${digest}`;
}

// GET /api/library/catalog?language=fr
app.get('/catalog', (c) => {
  const userId = getCurrentUserId(c);
  const language = c.req.query('language');
  if (!language || !isValidLanguageCode(language)) {
    return c.json({ error: 'Invalid language' }, 400);
  }
  const owned = new Set(
    (
      db
        .prepare('SELECT id FROM collections WHERE userId = ? AND language = ? AND id LIKE ?')
        .all(userId, language, `library-${language}-%`) as Array<{ id: string }>
    ).map((row) => row.id),
  );
  const books = listLibraryBooks(language).map((book) => ({
    ...book,
    added: owned.has(collectionIdFor(language, book.slug)),
  }));
  return c.json({ books });
});

// POST /api/library/add { language, slug }
app.post('/add', async (c) => {
  const userId = getCurrentUserId(c);
  let body: { language?: unknown; slug?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }
  const { language, slug } = body;
  if (typeof language !== 'string' || !isValidLanguageCode(language)) {
    return c.json({ error: 'Invalid language' }, 400);
  }
  if (!isLibrarySlug(slug)) return c.json({ error: 'Invalid book' }, 400);

  const book = loadLibraryBook(language, slug);
  if (!book) return c.json({ error: 'Book not found' }, 404);

  const collectionId = collectionIdFor(language, slug);
  const now = new Date().toISOString();
  const pack = LANGUAGES[language];

  const outcome = db.transaction(() => {
    const existing = db
      .prepare('SELECT language FROM collections WHERE userId = ? AND id = ?')
      .get(userId, collectionId) as { language: string } | undefined;
    if (existing) return { kind: 'present' as const };

    const lessons = book.lessons.map((lesson, sortOrder) => ({
      ...lesson,
      sortOrder,
      id: lessonIdFor(language, slug, lesson.sourceFile),
    }));
    const bytes = lessons.map((lesson) => lessonTextBytes(lesson.markdown, lesson.title));
    const checks: AtomicLimitCheck[] = [
      { metric: 'maxCollections', requested: 1 },
      { metric: 'maxLessons', requested: lessons.length },
      { metric: 'maxLessonTextBytes', requested: Math.max(0, ...bytes) },
      { metric: 'maxLessonTextBytesTotal', requested: bytes.reduce((a, b) => a + b, 0) },
      { metric: 'maxCollectionMetadataBytes', requested: collectionMetadataBytes(book) },
    ];

    const verdict = entitlements.reserveCount(userId, checks, () => {
      db.prepare(
        `INSERT INTO collections (id, title, author, coverUrl, language, createdAt, lastReadAt, userId)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(collectionId, book.title, book.author, null, language, now, now, userId);
      const insertLesson = db.prepare(
        `INSERT INTO lessons (id, collectionId, title, sortOrder, textContent, wordCount, segmentWords, language, createdAt, lastReadAt, userId)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const lesson of lessons) {
        insertLesson.run(
          lesson.id,
          collectionId,
          lesson.title,
          lesson.sortOrder,
          lesson.markdown,
          countWords(lesson.markdown, pack),
          segmentWordsFor(lesson.markdown, pack),
          language,
          now,
          now,
          userId,
        );
      }
    });
    return verdict.allowed ? { kind: 'added' as const } : { kind: 'limited' as const, verdict };
  })();

  if (outcome.kind === 'limited') return planLimitResponse(c, outcome.verdict);
  if (outcome.kind === 'present') {
    return c.json({ added: false, reason: 'already-added', collectionId });
  }
  return c.json({ added: true, collectionId, lessonCount: book.lessons.length });
});

export default app;
