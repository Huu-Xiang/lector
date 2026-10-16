import '../../test-guard';
import { beforeEach, describe, expect, test } from 'bun:test';
import { db } from '../../db';
import { refreshReadingFeed } from './refresh';
import { listReadingFeed, pruneReadingFeed } from './store';
import { READING_FEED_SOURCES } from './sources';

function reset() {
  db.prepare('DELETE FROM reading_feed').run();
}

function wordsText(count: number): string {
  return 'word. '.repeat(count);
}

describe('refreshReadingFeed', () => {
  beforeEach(reset);

  // A fetch stub covering every shape the registered sources request: the
  // Global Voices WordPress REST array, and the MediaWiki random+extracts
  // pair the wiki sources use.
  function makeFakeFetch(
    wpPosts: unknown[],
    mediawikiExtract: Record<string, unknown>,
  ): typeof fetch {
    return (async (url: string | URL) => {
      const path = url.toString();
      if (path.includes('wp-json')) return new Response(JSON.stringify(wpPosts));
      if (path.includes('list=random')) {
        return new Response(JSON.stringify({ query: { random: [{ id: 1 }] } }));
      }
      return new Response(JSON.stringify({ query: { pages: { '1': mediawikiExtract } } }));
    }) as typeof fetch;
  }

  test('stores articles within the word-count window, skips too-short and too-long ones', async () => {
    const source = READING_FEED_SOURCES[0];
    const posts = [
      {
        link: 'https://x/1',
        date: '2026-01-01',
        title: { rendered: 'Too short' },
        content: { rendered: wordsText(10) },
      },
      {
        link: 'https://x/2',
        date: '2026-01-01',
        title: { rendered: 'Just right' },
        content: { rendered: wordsText(300) },
      },
      {
        link: 'https://x/3',
        date: '2026-01-01',
        title: { rendered: 'Too long' },
        content: { rendered: wordsText(5000) },
      },
    ];
    const fakeFetch = makeFakeFetch(posts, {
      title: 'Unused',
      extract: wordsText(300),
      fullurl: 'https://x/unused',
    });

    await refreshReadingFeed(fakeFetch);
    const rows = listReadingFeed(source.language, source.interest);
    const titles = rows.map((r) => r.title);
    expect(titles).toContain('Just right');
    expect(titles).not.toContain('Too short');
    expect(titles).not.toContain('Too long');
  });

  test('re-fetching the same url updates the row instead of duplicating it', async () => {
    let call = 0;
    const fakeFetch = (async (url: string | URL) => {
      const path = url.toString();
      call += 1;
      const title = call <= 1 ? 'First title' : 'Updated title';
      if (path.includes('wp-json')) {
        return new Response(
          JSON.stringify([
            {
              link: 'https://x/same-url',
              date: '2026-01-01',
              title: { rendered: title },
              content: { rendered: wordsText(300) },
            },
          ]),
        );
      }
      if (path.includes('list=random')) {
        return new Response(JSON.stringify({ query: { random: [] } }));
      }
      return new Response(JSON.stringify({ query: { pages: {} } }));
    }) as typeof fetch;

    await refreshReadingFeed(fakeFetch);
    await refreshReadingFeed(fakeFetch);

    const source = READING_FEED_SOURCES[0];
    const rows = listReadingFeed(source.language, source.interest);
    const matching = rows.filter((r) => r.url === 'https://x/same-url');
    expect(matching).toHaveLength(1);
    expect(matching[0].title).toBe('Updated title');
  });

  test('prunes down to the newest 30 rows per language and interest', () => {
    const source = READING_FEED_SOURCES.find(
      (s) => s.language === 'en' && s.interest === 'travel',
    )!;
    const now = Date.now();
    for (let i = 0; i < 40; i += 1) {
      db.prepare(
        `INSERT INTO reading_feed
          (id, language, interest, source, title, url, author, license, licenseUrl, publishedAt, text, wordCount, level, fetchedAt)
         VALUES (?, ?, ?, ?, ?, ?, NULL, 'x', 'x', ?, 'text', 200, 'B1', ?)`,
      ).run(
        `row-${i}`,
        source.language,
        source.interest,
        'test',
        `Article ${i}`,
        `https://x/${i}`,
        new Date(now - i * 1000).toISOString(),
        new Date().toISOString(),
      );
    }
    pruneReadingFeed(source.language, source.interest);
    expect(listReadingFeed(source.language, source.interest)).toHaveLength(30);
  });
});
