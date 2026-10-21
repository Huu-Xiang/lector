import { Sentry } from '../sentry';
import { getLanguageConfig } from '../languages';
import { countWords } from '../html-to-markdown';
import { warmDescriptions } from './describe';
import { estimateCefrLevel } from './level-heuristic';
import { READING_FEED_SOURCES } from './sources';
import { pruneReadingFeed, upsertReadingFeedArticle } from './store';
import type { ReadingFeedSource } from './types';

const MIN_WORDS = 150;
const MAX_WORDS = 3000;

export function readingFeedEnabled(): boolean {
  if (process.env.READING_FEED === '0') return false;
  if ((process.env.DATA_DIR || '').includes('.test-data')) return false;
  return true;
}

async function refreshOneSource(
  source: ReadingFeedSource,
  fetchImpl: typeof fetch,
): Promise<number> {
  let saved = 0;
  try {
    const articles = await source.fetch(fetchImpl);
    const now = new Date().toISOString();
    for (const article of articles) {
      const wordCount = countWords(article.text, getLanguageConfig(source.language));
      if (wordCount < MIN_WORDS || wordCount > MAX_WORDS) continue;
      upsertReadingFeedArticle({
        language: source.language,
        interest: source.interest,
        source: article.source,
        title: article.title,
        url: article.url,
        author: article.author,
        license: article.license,
        licenseUrl: article.licenseUrl,
        publishedAt: article.publishedAt,
        text: article.text,
        wordCount,
        level: estimateCefrLevel(article.text, source.language),
        fetchedAt: now,
      });
      saved += 1;
    }
  } catch (err) {
    console.error(`[reading-feed] fetch failed for ${source.id}/${source.language}:`, err);
    Sentry.captureException(err);
  }
  return saved;
}

export async function refreshReadingFeed(fetchImpl: typeof fetch = fetch): Promise<number> {
  let total = 0;
  for (const source of READING_FEED_SOURCES) {
    total += await refreshOneSource(source, fetchImpl);
  }
  const buckets = new Set(READING_FEED_SOURCES.map((s) => `${s.language}:${s.interest}`));
  for (const bucket of buckets) {
    const [language, interest] = bucket.split(':') as [
      ReadingFeedSource['language'],
      ReadingFeedSource['interest'],
    ];
    pruneReadingFeed(language, interest);
  }
  return total;
}

let loopTimer: ReturnType<typeof setInterval> | null = null;
let kickTimer: ReturnType<typeof setTimeout> | null = null;

const STARTUP_DELAY_MS = 30_000;
const REFRESH_INTERVAL_MS = 9 * 60 * 60_000;

export function startReadingFeedRefresher(): boolean {
  if (!readingFeedEnabled()) return false;
  if (loopTimer || kickTimer) return true;

  const tick = async () => {
    try {
      const saved = await refreshReadingFeed();
      console.log(`[reading-feed] refreshed ${saved} article(s)`);
      const described = await warmDescriptions();
      console.log(`[reading-feed] wrote ${described} description(s)`);
    } catch (err) {
      console.error('[reading-feed] refresh tick failed:', err);
      Sentry.captureException(err);
    }
  };

  kickTimer = setTimeout(() => {
    void tick();
    loopTimer = setInterval(() => void tick(), REFRESH_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
  return true;
}
