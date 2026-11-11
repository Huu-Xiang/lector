import fs from 'node:fs';
import path from 'node:path';
import { translationFor } from './display-language';
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
  category: string | null;
  wordCount: number;
  source: { name: string; url: string; license: string };
  lessonCount: number;
  firstFile: string;
  titles: Record<string, string>;
  blurbs: Record<string, string>;
  /** Built by scripts/build-hard-words.py; empty for Chinese and Korean. */
  hardWords: string[];
  /** From `covers.json`. `credit` names the edition or the painting; `source` is where it is from. */
  cover: { url: string; credit: string; source: string } | null;
}

interface CoverEntry {
  file?: string;
  credit?: string;
  source?: string;
}

interface Manifest {
  title: string;
  author: string;
  level: string;
  category?: string;
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
    const covers = readJson<Record<string, CoverEntry>>(path.join(dir, 'covers.json')) ?? {};
    for (const slug of fs.readdirSync(dir).sort()) {
      const manifest = readJson<Manifest>(path.join(dir, slug, 'manifest.json'));
      if (!manifest || manifest.lessons.length === 0) continue;
      books.push({
        language,
        slug,
        title: manifest.title,
        author: manifest.author,
        level: manifest.level,
        category: manifest.category ?? null,
        wordCount: manifest.wordCount,
        source: manifest.source,
        lessonCount: manifest.lessons.length,
        firstFile: manifest.lessons[0].file,
        titles: translations[slug]?.title ?? {},
        blurbs: translations[slug]?.blurb ?? {},
        hardWords: hardWords[slug] ?? [],
        cover: covers[slug]?.file
          ? {
              url: `/library-covers/${language}/${covers[slug].file}`,
              credit: covers[slug].credit ?? '',
              source: covers[slug].source ?? '',
            }
          : null,
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
  return translationFor(map, locale) ?? map.en ?? fallback;
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

/** Languages that have at least one book, in display order. */
export function languagesWithBooks(): PublicBookLanguage[] {
  const present = new Set(listPublicBooks().map((b) => b.language));
  return PUBLIC_BOOK_LANGUAGES.filter((language) => present.has(language));
}

export function booksInLanguage(language: string): PublicBook[] {
  return listPublicBooks().filter((b) => b.language === language);
}

/** Levels that have books in a language, easiest first. */
export function levelsOf(language: string): string[] {
  const present = new Set(booksInLanguage(language).map((b) => b.level));
  return LEVELS.filter((level) => present.has(level));
}

/** The nearest easier and harder levels that have books in the same language. */
export function neighbourLevels(
  language: string,
  level: string,
): { easier: string | null; harder: string | null } {
  const levels = levelsOf(language);
  const i = levels.indexOf(level.toUpperCase());
  if (i === -1) return { easier: null, harder: null };
  return { easier: levels[i - 1] ?? null, harder: levels[i + 1] ?? null };
}

/** Cuts at a word boundary and adds an ellipsis when the text is longer than `max`. */
export function fitText(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.–-]+$/, '')}…`;
}

const CEFR_URL = 'https://www.coe.int/en/web/common-european-framework-reference-languages';

/** schema.org Book for one free book. `description` is added by the caller when a blurb exists. */
export function bookJsonLd(book: PublicBook) {
  const ccBySa = /CC BY-SA 4\.0/i.test(book.source.license);
  return {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: book.title,
    author: { '@type': 'Person', name: book.author },
    inLanguage: book.language,
    ...(book.category ? { genre: book.category } : {}),
    url: bookUrl(book),
    isAccessibleForFree: true,
    educationalLevel: {
      '@type': 'DefinedTerm',
      name: book.level,
      termCode: book.level,
      inDefinedTermSet: CEFR_URL,
    },
    wordCount: book.wordCount,
    timeRequired: readingDuration(book),
    license: ccBySa
      ? 'https://creativecommons.org/licenses/by-sa/4.0/'
      : 'https://creativecommons.org/publicdomain/mark/1.0/',
    copyrightNotice: book.source.license,
    ...(book.source.url ? { isBasedOn: book.source.url } : {}),
    ...(book.cover ? { image: `${SITE_ORIGIN}${book.cover.url}` } : {}),
  };
}

/** schema.org BreadcrumbList; `path` is the site path of each step. */
export function breadcrumbJsonLd(steps: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: steps.map((step, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: step.name,
      item: `${SITE_ORIGIN}${step.path}`,
    })),
  };
}
