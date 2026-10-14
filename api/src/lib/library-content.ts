import fs from 'fs';
import path from 'path';
import type { LanguageCode } from './languages';

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

function libraryDir(language: LanguageCode): string {
  const root =
    process.env.LIBRARY_CONTENT_ROOT || path.resolve(import.meta.dir, '../../../languages');
  return path.join(root, language, 'content', 'library');
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

function readManifest(dir: string, slug: string): Manifest {
  return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as Manifest;
}

function summarise(slug: string, manifest: Manifest): LibraryBookSummary {
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
  };
}

const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** Books of a language, easiest first. A malformed book throws: it is a packaging bug. */
export function listLibraryBooks(language: LanguageCode): LibraryBookSummary[] {
  const dir = libraryDir(language);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isLibrarySlug(entry.name))
    .filter((entry) => fs.existsSync(path.join(dir, entry.name, 'manifest.json')))
    .map((entry) => summarise(entry.name, readManifest(path.join(dir, entry.name), entry.name)))
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
  const summary = summarise(slug, manifest);
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
