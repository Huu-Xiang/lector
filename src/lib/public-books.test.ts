import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  authorSlug,
  authorsOf,
  bookJsonLd,
  bookListJsonLd,
  bookOpening,
  bookUrl,
  booksAtLevel,
  booksByAuthor,
  breadcrumbJsonLd,
  fitText,
  findPublicBook,
  firstChapter,
  languagesWithBooks,
  levelsOf,
  listPublicBooks,
  neighbourLevels,
  pickLocalized,
  readingDuration,
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
      expect(book.category, `${book.language}/${book.slug}`).toBeTruthy();
      expect(book.blurbs.en, `${book.language}/${book.slug}`).toBeTruthy();
    }
  });

  it('gives every shipped book a cover image that exists, with a credit and a source', () => {
    for (const book of listPublicBooks()) {
      const name = `${book.language}/${book.slug}`;
      expect(book.cover, name).not.toBeNull();
      expect(book.cover!.url, name).toMatch(/^\/library-covers\/[a-z]+\/[a-z0-9-]+\.webp$/);
      expect(fs.existsSync(path.join(process.cwd(), 'public', book.cover!.url)), name).toBe(true);
      expect(book.cover!.credit, name).toBeTruthy();
      expect(book.cover!.source, name).toMatch(/^https:\/\//);
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
    expect(pickLocalized({ en: 'A', 'zh-CN': '甲' }, 'zh-TW')).toBe('甲');
    expect(pickLocalized({}, 'zh-CN', 'X')).toBe('X');
  });

  it('estimates reading time from the word count', () => {
    const walden = findPublicBook('en', 'walden')!;
    expect(readingHours(walden)).toBeCloseTo(walden.wordCount / 200 / 60, 1);
  });

  it('reads the hard words for spaced languages only', () => {
    expect(findPublicBook('en', 'walden')!.hardWords).toHaveLength(50);
    expect(findPublicBook('en', 'walden')!.hardWords).not.toContain('walden');
    const korean = listPublicBooks().find((b) => b.language === 'ko')!;
    expect(korean.hardWords).toEqual([]);
  });

  it('gives the whole first lesson as the first chapter', () => {
    const walden = findPublicBook('en', 'walden')!;
    expect(firstChapter(walden).join('').length).toBeGreaterThan(
      bookOpening(walden).join('').length,
    );
  });

  it('makes author slugs that keep any script and fold Latin accents', () => {
    expect(authorSlug('Benito Pérez Galdós')).toBe('benito-perez-galdos');
    expect(authorSlug('Andrew Lang (editor)')).toBe('andrew-lang-editor');
    expect(authorSlug('방정환 (편역)')).toBe('방정환-편역');
  });

  it('groups books by level and by author', () => {
    expect(booksAtLevel('en', 'c2').map((b) => b.slug)).toContain('walden');
    expect(booksAtLevel('en', 'z9')).toEqual([]);
    expect(booksByAuthor('en', 'arthur-conan-doyle').length).toBeGreaterThan(1);
    const doyle = authorsOf('en').find((a) => a.slug === 'arthur-conan-doyle');
    expect(doyle?.count).toBe(booksByAuthor('en', 'arthur-conan-doyle').length);
  });
});

describe('public book structured data', () => {
  it('writes the reading time as a schema.org duration', () => {
    const book = findPublicBook('en', 'walden')!;
    expect(readingDuration(book)).toMatch(/^PT(\d+H)?(\d+M)?$/);
    expect(readingDuration({ ...book, wordCount: 200 * 90 })).toBe('PT1H30M');
    expect(readingDuration({ ...book, wordCount: 200 * 120 })).toBe('PT2H');
    expect(readingDuration({ ...book, wordCount: 100 })).toBe('PT1M');
  });

  it('lists books in order with their page URLs', () => {
    const books = booksAtLevel('en', 'b1').slice(0, 2);
    const ld = bookListJsonLd('English B1', '/books/en/level/b1', books);
    expect(ld.url).toBe('https://readfox.app/books/en/level/b1');
    expect(ld.numberOfItems).toBe(2);
    expect(ld.itemListElement[1]).toMatchObject({ position: 2, url: bookUrl(books[1]) });
  });
});

describe('book schema.org data', () => {
  it('describes every book as a free Book with language, level and author', () => {
    for (const book of listPublicBooks()) {
      const ld = bookJsonLd(book);
      const name = `${book.language}/${book.slug}`;
      expect(ld['@context'], name).toBe('https://schema.org');
      expect(ld['@type'], name).toBe('Book');
      expect(ld.name, name).toBe(book.title);
      expect(ld.author, name).toEqual({ '@type': 'Person', name: book.author });
      expect(ld.inLanguage, name).toBe(book.language);
      expect(ld.isAccessibleForFree, name).toBe(true);
      expect(ld.educationalLevel.termCode, name).toMatch(/^[ABC][12]$/);
      expect(ld.url, name).toBe(`https://readfox.app/books/${book.language}/${book.slug}`);
      expect(JSON.parse(JSON.stringify(ld)), name).toEqual(ld);
    }
  });

  it('writes a breadcrumb list with absolute URLs in order', () => {
    const ld = breadcrumbJsonLd([
      { name: 'All', path: '/books' },
      { name: 'English', path: '/books/en' },
    ]);
    expect(ld['@type']).toBe('BreadcrumbList');
    expect(ld.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'All', item: 'https://readfox.app/books' },
      { '@type': 'ListItem', position: 2, name: 'English', item: 'https://readfox.app/books/en' },
    ]);
  });
});

describe('language and level hubs', () => {
  it('lists the languages that have books, in display order', () => {
    const languages = languagesWithBooks();
    expect(languages).toContain('en');
    expect(languages).toContain('fr');
    expect(languages.indexOf('en')).toBeLessThan(languages.indexOf('fr'));
  });

  it('lists the levels of a language from easiest to hardest', () => {
    const levels = levelsOf('en');
    expect(levels).toEqual([...levels].sort());
    expect(levelsOf('xx')).toEqual([]);
  });

  it('finds the neighbouring levels that have books', () => {
    const levels = levelsOf('en');
    expect(neighbourLevels('en', levels[0]).easier).toBeNull();
    expect(neighbourLevels('en', levels[0]).harder).toBe(levels[1]);
    expect(neighbourLevels('en', levels[levels.length - 1]).harder).toBeNull();
    expect(neighbourLevels('en', 'z9')).toEqual({ easier: null, harder: null });
  });

  it('cuts text at a word boundary with an ellipsis', () => {
    expect(fitText('short text', 20)).toBe('short text');
    const cut = fitText('one two three four five six seven', 20);
    expect(cut.length).toBeLessThanOrEqual(20);
    expect(cut).toBe('one two three four…');
  });
});
