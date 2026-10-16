import { Hono } from 'hono';
import { db } from '../db';
import { getCurrentUserId } from '../lib/user';
import { buildSegmentWords, countWords } from '../lib/html-to-markdown';
import { entitlements, planLimitResponse, type AtomicLimitCheck } from '../lib/entitlements';
import { collectionMetadataBytes, lessonTextBytes } from '../lib/storage-limits';
import { getReadingFeedArticle, listReadingFeed } from '../lib/reading-feed/store';
import { cachedDescriptions, describeArticles } from '../lib/reading-feed/describe';
import { isNativeLanguageCode } from '../lib/languages';
import type { FeedLanguage, ReadingInterest } from '../lib/reading-feed/types';

const FEED_LANGUAGES = new Set<FeedLanguage>(['en', 'fr']);
const FEED_INTERESTS = new Set<ReadingInterest>(['news', 'travel', 'science']);

function isFeedLanguage(value: string | undefined): value is FeedLanguage {
  return Boolean(value) && FEED_LANGUAGES.has(value as FeedLanguage);
}

function isFeedInterest(value: string | undefined): value is ReadingInterest {
  return Boolean(value) && FEED_INTERESTS.has(value as ReadingInterest);
}

function attributionBlock(article: {
  title: string;
  source: string;
  author: string | null;
  url: string;
  license: string;
  licenseUrl: string;
}): string {
  const lines = ['---', `Title: ${article.title}`, `Source: ${article.source}`];
  if (article.author) lines.push(`Author: ${article.author}`);
  lines.push(`URL: ${article.url}`);
  lines.push(`License: ${article.license} (${article.licenseUrl})`);
  lines.push('Changes: text extracted');
  return lines.join('\n');
}

const app = new Hono();

// GET /api/reading-feed?language=en&interest=news
app.get('/', (c) => {
  const language = c.req.query('language');
  const interest = c.req.query('interest');
  if (!isFeedLanguage(language)) return c.json({ error: 'Invalid language' }, 400);
  if (!isFeedInterest(interest)) return c.json({ error: 'Invalid interest' }, 400);

  const rows = listReadingFeed(language, interest).map((row) => ({
    id: row.id,
    title: row.title,
    url: row.url,
    source: row.source,
    author: row.author,
    license: row.license,
    licenseUrl: row.licenseUrl,
    publishedAt: row.publishedAt,
    wordCount: row.wordCount,
    level: row.level,
  }));
  return c.json({ articles: rows });
});

const MAX_DESCRIBE_IDS = 12;

// POST /api/reading-feed/describe { ids, native }
app.post('/describe', async (c) => {
  let body: { ids?: unknown; native?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }
  if (!isNativeLanguageCode(body.native)) return c.json({ error: 'Invalid native language' }, 400);
  if (
    !Array.isArray(body.ids) ||
    body.ids.length === 0 ||
    body.ids.length > MAX_DESCRIBE_IDS ||
    body.ids.some((id) => typeof id !== 'string')
  ) {
    return c.json({ error: 'Invalid ids' }, 400);
  }
  const native = body.native;
  const ids = body.ids as string[];
  const articles = ids
    .map((id) => getReadingFeedArticle(id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row) && row!.language !== native);
  // An article that has left the feed keeps its description while a reader's library holds it.
  const kept = cachedDescriptions(
    ids.filter((id) => !getReadingFeedArticle(id)),
    native,
  );
  const described = await describeArticles(articles, native);
  return c.json({ descriptions: Object.fromEntries([...kept, ...described]) });
});

// POST /api/reading-feed/add { id }
app.post('/add', async (c) => {
  const userId = getCurrentUserId(c);
  let body: { id?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }
  if (typeof body.id !== 'string' || body.id.length === 0) {
    return c.json({ error: 'Invalid id' }, 400);
  }

  const article = getReadingFeedArticle(body.id);
  if (!article) return c.json({ error: 'Article not found' }, 404);

  const collectionId = `reading-feed-${article.id}`;
  const lessonId = `${collectionId}-lesson`;
  const now = new Date().toISOString();
  const markdown = `${article.text}\n\n${attributionBlock(article)}`;

  const outcome = db.transaction(() => {
    const existing = db
      .prepare('SELECT language FROM collections WHERE userId = ? AND id = ?')
      .get(userId, collectionId) as { language: string } | undefined;
    if (existing) return { kind: 'present' as const };

    const bytes = lessonTextBytes(markdown, article.title);
    const checks: AtomicLimitCheck[] = [
      { metric: 'maxCollections', requested: 1 },
      { metric: 'maxLessons', requested: 1 },
      { metric: 'maxLessonTextBytes', requested: bytes },
      { metric: 'maxLessonTextBytesTotal', requested: bytes },
      {
        metric: 'maxCollectionMetadataBytes',
        requested: collectionMetadataBytes({ title: article.title, author: article.author }),
      },
    ];

    const verdict = entitlements.reserveCount(userId, checks, () => {
      db.prepare(
        `INSERT INTO collections (id, title, author, coverUrl, language, createdAt, lastReadAt, userId)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        collectionId,
        article.title,
        article.author ?? article.source,
        null,
        article.language,
        now,
        now,
        userId,
      );
      db.prepare(
        `INSERT INTO lessons (id, collectionId, title, sortOrder, textContent, wordCount, segmentWords, language, createdAt, lastReadAt, userId)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        lessonId,
        collectionId,
        article.title,
        0,
        markdown,
        countWords(markdown),
        buildSegmentWords(markdown),
        article.language,
        now,
        now,
        userId,
      );
    });
    return verdict.allowed ? { kind: 'added' as const } : { kind: 'limited' as const, verdict };
  })();

  if (outcome.kind === 'limited') return planLimitResponse(c, outcome.verdict);
  if (outcome.kind === 'present') {
    return c.json({ added: false, reason: 'already-added', collectionId });
  }
  return c.json({ added: true, collectionId });
});

export default app;
