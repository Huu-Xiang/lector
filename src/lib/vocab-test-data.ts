import fs from 'node:fs';
import path from 'node:path';
import { listPublicBooks, type PublicBook } from './public-books';
import type { VocabAnswerLanguage, VocabTestData } from './vocab-test';

/** Server-only: reads the test words and per-book coverage from `languages/<lang>/content`. */

export const VOCAB_TEST_LANGUAGES = ['en', 'fr', 'es'] as const;
export type VocabTestLanguage = (typeof VOCAB_TEST_LANGUAGES)[number];

export function isVocabTestLanguage(code: string): code is VocabTestLanguage {
  return (VOCAB_TEST_LANGUAGES as readonly string[]).includes(code);
}

export interface VocabTestBook {
  slug: string;
  title: string;
  titles: Record<string, string>;
  author: string;
  level: string;
  cover: PublicBook['cover'];
  cov: number[] | null;
}

function contentDir(language: VocabTestLanguage): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), 'languages', language, 'content');
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function loadVocabTestData(
  answerLanguage?: VocabAnswerLanguage,
  targetLanguage: VocabTestLanguage = 'en',
): VocabTestData | null {
  const file =
    targetLanguage === 'en' && answerLanguage === 'ru' ? 'vocab-test-ru.json' : 'vocab-test.json';
  const data = readJson<VocabTestData>(path.join(contentDir(targetLanguage), file));
  if (!data || !Array.isArray(data.bands) || data.bands.length === 0) return null;
  if (targetLanguage === 'en' && answerLanguage === 'ru') {
    const complete = data.bands.every(
      (band) =>
        band.words.length > 0 &&
        band.words.every(
          (word) =>
            word.s.length > 0 &&
            word.s.every((sense) => sense.ru?.length && sense.ru.every((gloss) => gloss.trim())),
        ),
    );
    if (!complete) return null;
    return { ...data, answerLanguage };
  }
  if (targetLanguage !== 'en') {
    const complete = data.bands.every(
      (band) =>
        band.words.length > 0 &&
        band.words.every(
          (word) => word.s.length > 0 && word.s.every((sense) => Boolean(sense.en?.trim())),
        ),
    );
    if (!complete) return null;
    return { ...data, answerLanguage: 'en' };
  }
  return data;
}

export function loadVocabTestBooks(targetLanguage: VocabTestLanguage = 'en'): VocabTestBook[] {
  const needs =
    readJson<Record<string, { cov?: unknown }>>(
      path.join(contentDir(targetLanguage), 'library', 'vocab-needs.json'),
    ) ?? {};
  return listPublicBooks()
    .filter((book) => book.language === targetLanguage)
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
