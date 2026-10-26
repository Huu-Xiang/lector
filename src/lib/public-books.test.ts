import { describe, expect, it } from 'vitest';
import {
  bookOpening,
  findPublicBook,
  listPublicBooks,
  pickLocalized,
  readingHours,
} from './public-books';

describe('public books', () => {
  it('lists every shipped book with a title, level and English blurb', () => {
    const books = listPublicBooks();
    expect(books.length).toBeGreaterThan(150);
    for (const book of books) {
      expect(book.title).toBeTruthy();
      expect(book.level).toMatch(/^[ABC][12]$/);
      expect(book.lessonCount).toBeGreaterThan(0);
      expect(book.blurbs.en, `${book.language}/${book.slug}`).toBeTruthy();
    }
  });

  it('finds a book by language and slug, and nothing for an unknown one', () => {
    expect(findPublicBook('en', 'walden')?.author).toBe('Henry David Thoreau');
    expect(findPublicBook('en', 'no-such-book')).toBeNull();
    expect(findPublicBook('xx', 'walden')).toBeNull();
  });

  it('takes the opening paragraphs without markdown headings', () => {
    const opening = bookOpening(findPublicBook('en', 'walden')!);
    expect(opening.length).toBeGreaterThan(0);
    expect(opening[0]).toMatch(/^When I wrote the following pages/);
    expect(opening.join(' ')).not.toContain('#');
    expect(opening.join('').length).toBeLessThanOrEqual(1600);
  });

  it('picks the locale, then English, then the fallback', () => {
    expect(pickLocalized({ en: 'A', 'zh-CN': '甲' }, 'zh-CN')).toBe('甲');
    expect(pickLocalized({ en: 'A' }, 'zh-CN')).toBe('A');
    expect(pickLocalized({}, 'zh-CN', 'X')).toBe('X');
  });

  it('estimates reading time from the word count', () => {
    const walden = findPublicBook('en', 'walden')!;
    expect(readingHours(walden)).toBeCloseTo(walden.wordCount / 200 / 60, 1);
  });
});
