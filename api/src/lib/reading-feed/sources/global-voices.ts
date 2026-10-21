import { htmlToMarkdown } from '../../html-to-markdown';
import { fetchJson } from '../http';
import type { FeedLanguage, FetchedArticle, ReadingFeedSource } from '../types';

interface WpPost {
  link: string;
  date: string;
  title: { rendered: string };
  content: { rendered: string };
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&#8211;/g, '–')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

function makeGlobalVoicesSource(language: FeedLanguage, host: string): ReadingFeedSource {
  return {
    id: 'global-voices',
    interest: 'news',
    language,
    license: 'CC BY 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
    async fetch(fetchImpl): Promise<FetchedArticle[]> {
      const url = `https://${host}/wp-json/wp/v2/posts?per_page=30`;
      const posts = (await fetchJson(fetchImpl, url)) as WpPost[];
      return posts.map((post) => ({
        source: 'global-voices',
        url: post.link,
        title: decodeEntities(post.title.rendered),
        author: null,
        license: 'CC BY 3.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
        publishedAt: new Date(post.date).toISOString(),
        text: htmlToMarkdown(post.content.rendered),
      }));
    },
  };
}

export const GLOBAL_VOICES_EN = makeGlobalVoicesSource('en', 'globalvoices.org');
export const GLOBAL_VOICES_FR = makeGlobalVoicesSource('fr', 'fr.globalvoices.org');
export const GLOBAL_VOICES_ZH = makeGlobalVoicesSource('zh', 'zhs.globalvoices.org');
