export type ReviewSite = 'douban' | 'goodreads' | 'babelio' | 'booklog' | 'aladin';

const SITE_BY_NATIVE: Record<string, ReviewSite> = {
  'zh-CN': 'douban',
  'zh-TW': 'douban',
  fr: 'babelio',
  ja: 'booklog',
  ko: 'aladin',
};

export function reviewSiteFor(native: string): ReviewSite {
  return SITE_BY_NATIVE[native] ?? 'goodreads';
}

/** A search page, not a book page: the site picks the edition. Douban searches by the native title. */
export function bookReviewLink(
  native: string,
  book: { title: string; author: string; nativeTitle?: string },
): { site: ReviewSite; url: string } {
  const site = reviewSiteFor(native);
  const enc = encodeURIComponent;
  const text = `${book.title} ${book.author}`.trim();
  switch (site) {
    case 'douban':
      return {
        site,
        url: `https://search.douban.com/book/subject_search?search_text=${enc(book.nativeTitle || book.title)}&cat=1001`,
      };
    case 'babelio':
      return { site, url: `https://www.babelio.com/resrecherche.php?Recherche=${enc(text)}` };
    case 'booklog':
      return { site, url: `https://booklog.jp/search?keyword=${enc(text)}` };
    case 'aladin':
      return {
        site,
        url: `https://www.aladin.co.kr/search/wsearchresult.aspx?SearchTarget=Book&SearchWord=${enc(text)}`,
      };
    default:
      return { site, url: `https://www.goodreads.com/search?q=${enc(text)}` };
  }
}
