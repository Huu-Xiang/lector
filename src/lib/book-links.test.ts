import { describe, expect, it } from 'vitest';
import { bookReviewLink, reviewSiteFor } from './book-links';

const book = { title: 'Black Beauty', author: 'Anna Sewell', nativeTitle: '黑骏马' };

describe('book review links', () => {
  it('picks the site by native language, Goodreads by default', () => {
    expect(reviewSiteFor('zh-CN')).toBe('douban');
    expect(reviewSiteFor('zh-TW')).toBe('douban');
    expect(reviewSiteFor('fr')).toBe('babelio');
    expect(reviewSiteFor('ja')).toBe('booklog');
    expect(reviewSiteFor('ko')).toBe('aladin');
    expect(reviewSiteFor('en')).toBe('goodreads');
    expect(reviewSiteFor('xx')).toBe('goodreads');
  });

  it('searches Douban by the Chinese title and others by title and author', () => {
    expect(bookReviewLink('zh-CN', book).url).toBe(
      `https://search.douban.com/book/subject_search?search_text=${encodeURIComponent('黑骏马')}&cat=1001`,
    );
    expect(bookReviewLink('en', book).url).toBe(
      'https://www.goodreads.com/search?q=Black%20Beauty%20Anna%20Sewell',
    );
  });
});
