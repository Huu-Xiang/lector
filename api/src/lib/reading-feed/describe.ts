import { db } from '../../db';
import { getSharedContentProvider, type LLMProvider } from '../llm';
import { isNativeLanguageCode, nativeLanguageName } from '../languages';
import type { FeedLanguage, ReadingFeedRow } from './types';

export interface ArticleDescription {
  title: string;
  summary: string;
}

const EXCERPT_CHARS = 1500;

const FEED_LANGUAGE_NAMES: Record<FeedLanguage, string> = {
  en: 'English',
  fr: 'French',
  zh: 'Chinese',
};
const MAX_PARALLEL = 4;

let providerFactory: () => LLMProvider = getSharedContentProvider;

export function setDescribeProviderForTests(factory: (() => LLMProvider) | null): void {
  providerFactory = factory ?? getSharedContentProvider;
}

const inFlight = new Map<string, Promise<ArticleDescription | null>>();

export function cachedDescriptions(ids: string[], native: string): Map<string, ArticleDescription> {
  const found = new Map<string, ArticleDescription>();
  const stmt = db.prepare(
    'SELECT title, summary FROM reading_feed_summary WHERE articleId = ? AND native = ?',
  );
  for (const id of ids) {
    const row = stmt.get(id, native) as ArticleDescription | undefined;
    if (row) found.set(id, row);
  }
  return found;
}

export function parseDescription(text: string): ArticleDescription | null {
  const body = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    const value = JSON.parse(body) as { title?: unknown; summary?: unknown };
    const title = typeof value.title === 'string' ? value.title.trim() : '';
    const summary = typeof value.summary === 'string' ? value.summary.trim() : '';
    return title && summary ? { title: title.slice(0, 200), summary: summary.slice(0, 600) } : null;
  } catch {
    return null;
  }
}

export function buildDescribePrompt(
  article: Pick<ReadingFeedRow, 'title' | 'text' | 'language'>,
  nativeName: string,
): string {
  return `A language learner whose native language is ${nativeName} is choosing what to read. Below is the start of an article in ${FEED_LANGUAGE_NAMES[article.language]}.

Reply with JSON only, no markdown: {"title": "<the article title translated into ${nativeName}>", "summary": "<one or two plain sentences in ${nativeName} saying what the article is about, at most 60 words>"}

Title: ${article.title}

Text:
${article.text.slice(0, EXCERPT_CHARS)}`;
}

async function generate(
  article: ReadingFeedRow,
  native: string,
): Promise<ArticleDescription | null> {
  const key = `${article.id}|${native}`;
  const running = inFlight.get(key);
  if (running) return running;
  const job = (async () => {
    try {
      const text = await providerFactory().complete({
        messages: [
          { role: 'user', content: buildDescribePrompt(article, nativeLanguageName(native)) },
        ],
        maxTokens: 300,
      });
      const description = parseDescription(text);
      if (!description) return null;
      db.prepare(
        `INSERT OR REPLACE INTO reading_feed_summary (articleId, native, title, summary, createdAt)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(article.id, native, description.title, description.summary, new Date().toISOString());
      return description;
    } catch (err) {
      console.error('[reading-feed] describe failed:', err);
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, job);
  return job;
}

/** Cached descriptions plus new ones for the articles that have none; failures are left out. */
export async function describeArticles(
  articles: ReadingFeedRow[],
  native: string,
): Promise<Map<string, ArticleDescription>> {
  const result = cachedDescriptions(
    articles.map((a) => a.id),
    native,
  );
  const missing = articles.filter((a) => !result.has(a.id));
  for (let i = 0; i < missing.length; i += MAX_PARALLEL) {
    const batch = missing.slice(i, i + MAX_PARALLEL);
    const done = await Promise.all(batch.map((a) => generate(a, native)));
    batch.forEach((a, n) => {
      const d = done[n];
      if (d) result.set(a.id, d);
    });
  }
  return result;
}

/** Native languages readers have chosen, plus Chinese, the most common one. */
export function knownNatives(): string[] {
  const rows = db
    .prepare("SELECT DISTINCT value FROM settings WHERE key = 'nativeLanguage'")
    .all() as Array<{ value: string }>;
  const natives = new Set<string>(['zh-CN']);
  for (const { value } of rows) {
    try {
      const code: unknown = JSON.parse(value);
      if (isNativeLanguageCode(code)) natives.add(code);
    } catch {
      // not a language code
    }
  }
  return [...natives];
}

/** Writes the missing descriptions ahead of time so a reader's first view is instant. */
export async function warmDescriptions(): Promise<number> {
  const articles = db.prepare('SELECT * FROM reading_feed').all() as ReadingFeedRow[];
  let made = 0;
  for (const native of knownNatives()) {
    const wanted = articles.filter((a) => a.language !== native);
    const before = cachedDescriptions(
      wanted.map((a) => a.id),
      native,
    ).size;
    const after = (await describeArticles(wanted, native)).size;
    made += Math.max(0, after - before);
  }
  return made;
}
