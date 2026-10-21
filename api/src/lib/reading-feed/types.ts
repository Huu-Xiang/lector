export type ReadingInterest = 'news' | 'travel' | 'science';
export type FeedLanguage = 'en' | 'fr' | 'zh';
export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface FetchedArticle {
  source: string;
  url: string;
  title: string;
  author: string | null;
  license: string;
  licenseUrl: string;
  publishedAt: string;
  text: string;
}

export interface ReadingFeedRow {
  id: string;
  language: FeedLanguage;
  interest: ReadingInterest;
  source: string;
  title: string;
  url: string;
  author: string | null;
  license: string;
  licenseUrl: string;
  publishedAt: string;
  text: string;
  wordCount: number;
  level: CefrLevel;
  fetchedAt: string;
}

export interface ReadingFeedSource {
  id: string;
  interest: ReadingInterest;
  language: FeedLanguage;
  license: string;
  licenseUrl: string;
  fetch: (fetchImpl: typeof fetch) => Promise<FetchedArticle[]>;
}
