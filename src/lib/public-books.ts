import fs from 'node:fs';
import path from 'node:path';
import { readingMinutes } from './reading-time';

/** Server-only: reads the free library from `languages/<code>/content/library`. */

export const PUBLIC_BOOK_LANGUAGES = ['en', 'fr', 'es', 'zh', 'ko'] as const;
export type PublicBookLanguage = (typeof PUBLIC_BOOK_LANGUAGES)[number];

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

export interface PublicBook {
  language: PublicBookLanguage;
  slug: string;
  title: string;
  author: string;
  level: string;
  wordCount: number;
  source: { name: string; url: string; license: string };
  lessonCount: number;
  firstFile: string;
  titles: Record<string, string>;
  blurbs: Record<string, string>;
  /** Built by scripts/build-hard-words.py; empty for Chinese and Korean. */
  hardWords: string[];
}

interface Manifest {
  title: string;
  author: string;
  level: string;
  wordCount: number;
  source: PublicBook['source'];
  lessons: Array<{ file: string; title: string }>;
}

interface Translations {
  [slug: string]: { title?: Record<string, string>; blurb?: Record<string, string> };
}

let cache: PublicBook[] | null = null;

function libraryDir(language: string): string {
  // The image copies languages/ itself; keep the build from tracing 12,000 library files.
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    'languages',
    language,
    'content',
    'library',
  );
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function levelRank(level: string): number {
  const i = (LEVELS as readonly string[]).indexOf(level);
  return i === -1 ? LEVELS.length : i;
}

/** Every free book, by language, then level, then title. */
export function listPublicBooks(): PublicBook[] {
  if (cache) return cache;
  const books: PublicBook[] = [];
  for (const language of PUBLIC_BOOK_LANGUAGES) {
    const dir = libraryDir(language);
    if (!fs.existsSync(dir)) continue;
    const translations = readJson<Translations>(path.join(dir, 'translations.json')) ?? {};
    const hardWords = readJson<Record<string, string[]>>(path.join(dir, 'hard-words.json')) ?? {};
    for (const slug of fs.readdirSync(dir).sort()) {
      const manifest = readJson<Manifest>(path.join(dir, slug, 'manifest.json'));
      if (!manifest || manifest.lessons.length === 0) continue;
      books.push({
        language,
        slug,
        title: manifest.title,
        author: manifest.author,
        level: manifest.level,
        wordCount: manifest.wordCount,
        source: manifest.source,
        lessonCount: manifest.lessons.length,
        firstFile: manifest.lessons[0].file,
        titles: translations[slug]?.title ?? {},
        blurbs: translations[slug]?.blurb ?? {},
        hardWords: hardWords[slug] ?? [],
      });
    }
  }
  books.sort(
    (a, b) =>
      PUBLIC_BOOK_LANGUAGES.indexOf(a.language) - PUBLIC_BOOK_LANGUAGES.indexOf(b.language) ||
      levelRank(a.level) - levelRank(b.level) ||
      a.title.localeCompare(b.title),
  );
  cache = books;
  return books;
}

export function findPublicBook(language: string, slug: string): PublicBook | null {
  return listPublicBooks().find((b) => b.language === language && b.slug === slug) ?? null;
}

function firstLessonText(book: PublicBook): string {
  try {
    return fs.readFileSync(path.join(libraryDir(book.language), book.slug, book.firstFile), 'utf8');
  } catch {
    return '';
  }
}

/** The opening paragraphs of the first chapter, at most about `maxChars` characters. */
export function bookOpening(book: PublicBook, maxChars = 1500): string[] {
  const text = firstLessonText(book);
  const paragraphs: string[] = [];
  let used = 0;
  for (const block of text.split(/\n\s*\n/)) {
    const paragraph = block
      .replace(/^#+\s.*$/gm, '')
      .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1')
      .replace(/\s*\n\s*/g, ' ')
      .trim();
    if (!paragraph) continue;
    if (used > 0 && used + paragraph.length > maxChars) break;
    if (paragraph.length > maxChars) {
      const cut = paragraph.slice(0, maxChars);
      const space = cut.lastIndexOf(' ');
      paragraphs.push(`${space > maxChars / 2 ? cut.slice(0, space) : cut}…`);
      break;
    }
    paragraphs.push(paragraph);
    used += paragraph.length;
    if (used >= maxChars) break;
  }
  return paragraphs;
}

/** Every paragraph of the first lesson, with headings and emphasis marks removed. */
export function firstChapter(book: PublicBook): string[] {
  return bookOpening(book, Number.POSITIVE_INFINITY);
}

export function levelSlug(level: string): string {
  return level.toLowerCase();
}

/** URL segment for an author; keeps letters of any script, folds Latin accents. */
export function authorSlug(author: string): string {
  return author
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

export function booksAtLevel(language: string, level: string): PublicBook[] {
  return listPublicBooks().filter(
    (b) => b.language === language && levelSlug(b.level) === level.toLowerCase(),
  );
}

export function booksByAuthor(language: string, slug: string): PublicBook[] {
  return listPublicBooks().filter((b) => b.language === language && authorSlug(b.author) === slug);
}

/** An author with one book links straight to it; two or more get an author page. */
export const AUTHOR_PAGE_MIN_BOOKS = 2;

/** Distinct authors of one language, by name. */
export function authorsOf(language: string): Array<{ name: string; slug: string; count: number }> {
  const bySlug = new Map<string, { name: string; slug: string; count: number }>();
  for (const book of listPublicBooks()) {
    if (book.language !== language) continue;
    const slug = authorSlug(book.author);
    if (!slug) continue;
    const entry = bySlug.get(slug) ?? { name: book.author, slug, count: 0 };
    entry.count += 1;
    bySlug.set(slug, entry);
  }
  return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The value for the interface locale, else English, else the given fallback. */
export function pickLocalized(map: Record<string, string>, locale: string, fallback = ''): string {
  return map[locale] ?? map.en ?? fallback;
}

export function readingHours(book: PublicBook): number {
  return readingMinutes(book.wordCount, book.language) / 60;
}

export const SITE_ORIGIN = 'https://readfox.app';

export function bookUrl(book: PublicBook): string {
  return `${SITE_ORIGIN}/books/${book.language}/${book.slug}`;
}

/** schema.org duration, such as `PT3H20M`. */
export function readingDuration(book: PublicBook): string {
  const minutes = readingMinutes(book.wordCount, book.language);
  const hours = Math.floor(minutes / 60);
  return `PT${hours ? `${hours}H` : ''}${minutes % 60 || !hours ? `${minutes % 60}M` : ''}`;
}

/** schema.org ItemList of book pages, for the level and author lists. */
export function bookListJsonLd(name: string, path: string, books: PublicBook[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    url: `${SITE_ORIGIN}${path}`,
    numberOfItems: books.length,
    itemListElement: books.map((book, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: bookUrl(book),
      name: book.title,
    })),
  };
}
