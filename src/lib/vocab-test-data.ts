import fs from 'node:fs';
import path from 'node:path';
import { listPublicBooks, type PublicBook } from './public-books';
import type { VocabTestData } from './vocab-test';

/** Server-only: reads the test words and per-book coverage from `languages/en/content`. */

export interface VocabTestBook {
  slug: string;
  title: string;
  titles: Record<string, string>;
  author: string;
  level: string;
  cover: PublicBook['cover'];
  cov: number[] | null;
}

function contentDir(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), 'languages', 'en', 'content');
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function loadVocabTestData(): VocabTestData | null {
  const data = readJson<VocabTestData>(path.join(contentDir(), 'vocab-test.json'));
  return data && Array.isArray(data.bands) && data.bands.length > 0 ? data : null;
}

export function loadVocabTestBooks(): VocabTestBook[] {
  const needs =
    readJson<Record<string, { cov?: unknown }>>(
      path.join(contentDir(), 'library', 'vocab-needs.json'),
    ) ?? {};
  return listPublicBooks()
    .filter((book) => book.language === 'en')
    .map((book) => {
      const cov = needs[book.slug]?.cov;
      return {
        slug: book.slug,
        title: book.title,
        titles: book.titles,
        author: book.author,
        level: book.level,
        cover: book.cover,
        cov:
          Array.isArray(cov) && cov.every((v) => typeof v === 'number') ? (cov as number[]) : null,
      };
    });
}
