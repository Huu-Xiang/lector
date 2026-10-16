import { fetchJson } from '../http';
import type { FeedLanguage, FetchedArticle, ReadingFeedSource, ReadingInterest } from '../types';

interface MediaWikiWikiConfig {
  id: string;
  interest: ReadingInterest;
  language: FeedLanguage;
  host: string;
  license: string;
  licenseUrl: string;
  sampleSize: number;
}

interface RandomPage {
  id: number;
  title: string;
}

interface ExtractPage {
  title: string;
  extract?: string;
  fullurl?: string;
  missing?: string;
}

// Random main-namespace pages, not a search query, so the sample rotates with
// every refresh and needs no per-wiki curated category name.
async function fetchRandomPages(
  fetchImpl: typeof fetch,
  host: string,
  limit: number,
): Promise<RandomPage[]> {
  const url = `https://${host}/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=${limit}&format=json`;
  const data = (await fetchJson(fetchImpl, url)) as {
    query?: { random?: RandomPage[] };
  };
  return data.query?.random ?? [];
}

async function fetchExtracts(
  fetchImpl: typeof fetch,
  host: string,
  pageIds: number[],
): Promise<ExtractPage[]> {
  if (pageIds.length === 0) return [];
  const url = `https://${host}/w/api.php?action=query&prop=extracts|info&explaintext=1&inprop=url&pageids=${pageIds.join('|')}&format=json`;
  const data = (await fetchJson(fetchImpl, url)) as {
    query?: { pages?: Record<string, ExtractPage> };
  };
  return Object.values(data.query?.pages ?? {});
}

function makeMediaWikiSource(wiki: MediaWikiWikiConfig): ReadingFeedSource {
  return {
    id: wiki.id,
    interest: wiki.interest,
    language: wiki.language,
    license: wiki.license,
    licenseUrl: wiki.licenseUrl,
    async fetch(fetchImpl): Promise<FetchedArticle[]> {
      const pages = await fetchRandomPages(fetchImpl, wiki.host, wiki.sampleSize);
      const extracts = await fetchExtracts(
        fetchImpl,
        wiki.host,
        pages.map((p) => p.id),
      );
      const now = new Date().toISOString();
      return extracts
        .filter((page) => !page.missing && page.extract && page.fullurl)
        .map((page) => ({
          source: wiki.id,
          url: page.fullurl!,
          title: page.title,
          author: null,
          license: wiki.license,
          licenseUrl: wiki.licenseUrl,
          publishedAt: now,
          text: page.extract!,
        }));
    },
  };
}

export const WIKIVOYAGE_EN = makeMediaWikiSource({
  id: 'wikivoyage',
  interest: 'travel',
  language: 'en',
  host: 'en.wikivoyage.org',
  license: 'CC BY-SA 3.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
  sampleSize: 20,
});

export const WIKIVOYAGE_FR = makeMediaWikiSource({
  id: 'wikivoyage',
  interest: 'travel',
  language: 'fr',
  host: 'fr.wikivoyage.org',
  license: 'CC BY-SA 3.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
  sampleSize: 20,
});

export const SIMPLE_WIKIPEDIA_EN = makeMediaWikiSource({
  id: 'simple-wikipedia',
  interest: 'science',
  language: 'en',
  host: 'simple.wikipedia.org',
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  sampleSize: 20,
});

export const VIKIDIA_FR = makeMediaWikiSource({
  id: 'vikidia',
  interest: 'science',
  language: 'fr',
  host: 'fr.vikidia.org',
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  sampleSize: 20,
});
