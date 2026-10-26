import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import type { LanguageCode } from './languages';
import { lessonTextBytes } from './storage-limits';

/**
 * Free library: public-domain books a language pack ships under
 * `languages/<code>/content/library/<slug>/` as a manifest.json plus one
 * markdown file per lesson. Read from disk on the server only; adding a book
 * copies it into the learner's own collection.
 *
 * LIBRARY_CONTENT_ROOT overrides the root for tests.
 */

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

export interface LibraryBookSummary {
  slug: string;
  title: string;
  author: string;
  level: string;
  wordCount: number;
  lessonCount: number;
  sourceName: string;
  sourceUrl: string;
  license: string;
  /** Title and one-line blurb keyed by native-language code; may be empty. */
  titles: Record<string, string>;
  blurbs: Record<string, string>;
}

export interface LibraryBook extends LibraryBookSummary {
  lessons: Array<{ sourceFile: string; title: string; markdown: string }>;
}

interface Manifest {
  title?: unknown;
  author?: unknown;
  level?: unknown;
  wordCount?: unknown;
  source?: { name?: unknown; url?: unknown; license?: unknown };
  lessons?: Array<{ file?: unknown; title?: unknown }>;
}

function contentRoot(): string {
  return process.env.LIBRARY_CONTENT_ROOT || path.resolve(import.meta.dir, '../../../languages');
}

function libraryDir(language: LanguageCode): string {
  return path.join(contentRoot(), language, 'content', 'library');
}

export const libraryCollectionIdFor = (language: string, slug: string) =>
  `library-${language}-${slug}`;

export function libraryLessonIdFor(language: string, slug: string, sourceFile: string): string {
  const digest = createHash('sha256').update(`${slug}/${sourceFile}`).digest('hex');
  return `library-${language}-lesson-${digest}`;
}

const shippedLessonBytes = new Map<string, Map<string, number>>();

/** Bytes of every shipped library lesson as an add stores it, keyed by lesson id. */
export function libraryLessonBytes(): Map<string, number> {
  const root = contentRoot();
  const cached = shippedLessonBytes.get(root);
  if (cached) return cached;
  const sizes = new Map<string, number>();
  const languages = fs.existsSync(root) ? fs.readdirSync(root) : [];
  for (const language of languages as LanguageCode[]) {
    if (!fs.existsSync(libraryDir(language))) continue;
    for (const { slug } of listLibraryBooks(language)) {
      for (const lesson of loadLibraryBook(language, slug)?.lessons ?? []) {
        sizes.set(
          libraryLessonIdFor(language, slug, lesson.sourceFile),
          lessonTextBytes(lesson.markdown, lesson.title),
        );
      }
    }
  }
  shippedLessonBytes.set(root, sizes);
  return sizes;
}

/**
 * Free library lessons do not count toward the lesson and text limits. Only a
 * shipped lesson id qualifies, and only up to its shipped size.
 */
export function isShippedLibraryLesson(id: string): boolean {
  return libraryLessonBytes().has(id);
}

export function countableLessonBytes(id: string, bytes: number): number {
  return bytes - Math.min(bytes, libraryLessonBytes().get(id) ?? 0);
}

export function isLibrarySlug(value: unknown): value is string {
  return typeof value === 'string' && SLUG.test(value);
}

function str(value: unknown, field: string, slug: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Library book '${slug}' has no ${field}`);
  }
  return value;
}

type Translations = Record<
  string,
  { title?: Record<string, string>; blurb?: Record<string, string> }
>;

/** `translations.json` sits beside the book folders so a rebuild of a book keeps it. */
function readTranslations(language: LanguageCode): Translations {
  const file = path.join(libraryDir(language), 'translations.json');
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Translations;
}

function readManifest(dir: string, slug: string): Manifest {
  return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as Manifest;
}

function summarise(
  slug: string,
  manifest: Manifest,
  translations: Translations,
): LibraryBookSummary {
  if (!Array.isArray(manifest.lessons) || manifest.lessons.length === 0) {
    throw new Error(`Library book '${slug}' has no lessons`);
  }
  return {
    slug,
    title: str(manifest.title, 'title', slug),
    author: str(manifest.author, 'author', slug),
    level: str(manifest.level, 'level', slug),
    wordCount: typeof manifest.wordCount === 'number' ? manifest.wordCount : 0,
    lessonCount: manifest.lessons.length,
    sourceName: str(manifest.source?.name, 'source name', slug),
    sourceUrl: str(manifest.source?.url, 'source url', slug),
    license: str(manifest.source?.license, 'license', slug),
    titles: translations[slug]?.title ?? {},
    blurbs: translations[slug]?.blurb ?? {},
  };
}

const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** Books of a language, easiest first. A malformed book throws: it is a packaging bug. */
export function listLibraryBooks(language: LanguageCode): LibraryBookSummary[] {
  const dir = libraryDir(language);
  if (!fs.existsSync(dir)) return [];
  const translations = readTranslations(language);
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isLibrarySlug(entry.name))
    .filter((entry) => fs.existsSync(path.join(dir, entry.name, 'manifest.json')))
    .map((entry) =>
      summarise(entry.name, readManifest(path.join(dir, entry.name), entry.name), translations),
    )
    .sort(
      (a, b) =>
        LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) ||
        a.title.localeCompare(b.title),
    );
}

export function loadLibraryBook(language: LanguageCode, slug: string): LibraryBook | null {
  if (!isLibrarySlug(slug)) return null;
  const bookDir = path.join(libraryDir(language), slug);
  if (!fs.existsSync(path.join(bookDir, 'manifest.json'))) return null;
  const manifest = readManifest(bookDir, slug);
  const summary = summarise(slug, manifest, readTranslations(language));
  const seen = new Set<string>();
  const lessons = manifest.lessons!.map((lesson) => {
    const file = str(lesson.file, 'lesson file', slug);
    const title = str(lesson.title, 'lesson title', slug);
    const filePath = path.resolve(bookDir, file);
    if (!filePath.startsWith(path.resolve(bookDir) + path.sep)) {
      throw new Error(`Library lesson path escapes the book: ${file}`);
    }
    if (seen.has(file)) throw new Error(`Library book '${slug}' repeats lesson file ${file}`);
    seen.add(file);
    return { sourceFile: file, title, markdown: fs.readFileSync(filePath, 'utf8') };
  });
  return { ...summary, lessons };
}
