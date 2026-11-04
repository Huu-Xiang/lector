import '../../test-guard';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  buildLibraryIndex,
  candidateChapters,
  chapterSentences,
  getLibraryIndex,
  libraryIndexBuildCount,
  resetLibraryIndexes,
  sentenceAt,
} from './sentence-index';

const previousRoot = process.env.LIBRARY_CONTENT_ROOT;

beforeAll(() => {
  process.env.LIBRARY_CONTENT_ROOT = path.resolve(
    import.meta.dir,
    '../../test-fixtures/library-content',
  );
});

afterAll(() => {
  if (previousRoot === undefined) delete process.env.LIBRARY_CONTENT_ROOT;
  else process.env.LIBRARY_CONTENT_ROOT = previousRoot;
});

beforeEach(() => resetLibraryIndexes());

describe('library sentence index', () => {
  test('the first request starts the build and gets nothing until it ends', async () => {
    expect(getLibraryIndex('en')).toBeNull();
    expect(getLibraryIndex('en')).toBeNull();
    const built = await buildLibraryIndex('en');
    expect(built).not.toBeNull();
    expect(getLibraryIndex('en')).toBe(built);
  });

  test('the index builds once per language per process', async () => {
    const [a, b] = await Promise.all([buildLibraryIndex('en'), buildLibraryIndex('en')]);
    getLibraryIndex('en');
    await buildLibraryIndex('en');
    expect(a).toBe(b);
    expect(libraryIndexBuildCount('en')).toBe(1);
    await buildLibraryIndex('es');
    expect(libraryIndexBuildCount('es')).toBe(1);
    expect(libraryIndexBuildCount('en')).toBe(1);
  });

  test('a language without a library builds an empty index', async () => {
    const index = await buildLibraryIndex('fr');
    expect(index?.chapters).toHaveLength(0);
  });

  test('every lesson is a chapter with its book and level', async () => {
    const index = (await buildLibraryIndex('en'))!;
    expect(
      index.chapters.map((c) => [c.bookSlug, c.lessonIndex, c.chapterTitle, c.bookLevel]),
    ).toEqual([
      ['harbor-tales', 0, '1. The Port', 'A2'],
      ['harbor-tales', 1, '2. The Storm', 'A2'],
      ['sea-stories', 0, '1. Night Watch', 'B2'],
    ]);
    expect(index.chapters[0].bookTitle).toBe('Harbor Tales');
    expect(index.chapters[0].sourceFile).toBe('01.md');
    expect(index.chapters[0].wordCount).toBeGreaterThan(20);
  });

  test('sentences come from stripped text, with offsets and word counts', async () => {
    const index = (await buildLibraryIndex('en'))!;
    const sentences = chapterSentences(index, index.chapters[0])!;
    const texts = Array.from({ length: sentences.count }, (_, i) => sentenceAt(sentences, i));
    expect(texts).toEqual([
      'The small boat stayed in the harbor all night.',
      'Many old ships harbored rats in the dark corners of the port.',
      'The town harbors many secrets from visitors.',
      'The first snow was a harbinger of a long winter.',
    ]);
    expect(sentences.text.slice(sentences.starts[1], sentences.ends[1])).toBe(texts[1]);
    expect(Array.from(sentences.words)).toEqual([9, 12, 7, 10]);
    const storm = chapterSentences(index, index.chapters[1])!;
    expect(storm.words[2]).toBeGreaterThan(30);
  });

  test('only chapters that can hold the word are candidates', async () => {
    const index = (await buildLibraryIndex('en'))!;
    const slugs = (word: string) =>
      candidateChapters(index, [[word]]).map((c) => `${c.bookSlug}/${c.sourceFile}`);
    expect(slugs('harbor')).toEqual([
      'harbor-tales/01.md',
      'harbor-tales/02.md',
      'sea-stories/01.md',
    ]);
    expect(slugs('harbored')).toEqual(['harbor-tales/01.md']);
    expect(slugs('zeppelin')).toEqual([]);
    expect(
      candidateChapters(index, [['gave', 'up'], ['harbored']]).map((c) => c.sourceFile),
    ).toEqual(['01.md', '02.md']);
  });

  test('a missing library folder builds an empty index', async () => {
    const saved = process.env.LIBRARY_CONTENT_ROOT;
    process.env.LIBRARY_CONTENT_ROOT = path.resolve(import.meta.dir, 'no-such-root');
    try {
      const index = await buildLibraryIndex('en');
      expect(index?.chapters ?? []).toHaveLength(0);
    } finally {
      process.env.LIBRARY_CONTENT_ROOT = saved;
    }
  });
});
