import '../test-guard';
import { describe, expect, test } from 'bun:test';
import { getAllLanguages, NATIVE_LANGUAGES } from './languages';
import { listLibraryBooks, loadLibraryBook } from './library-content';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

describe('shipped library books', () => {
  const shipped = getAllLanguages().flatMap((lang) =>
    listLibraryBooks(lang.code).map((book) => ({ code: lang.code, book })),
  );

  test('French and English have at least three books at every level', () => {
    for (const code of ['fr', 'en']) {
      for (const level of LEVELS) {
        const count = shipped.filter((s) => s.code === code && s.book.level === level).length;
        expect(`${code} ${level}: ${count}`).toBe(`${code} ${level}: ${Math.max(count, 3)}`);
      }
    }
  });

  test('at least French and English ship books', () => {
    const codes = new Set(shipped.map((s) => s.code));
    expect(codes.has('fr')).toBe(true);
    expect(codes.has('en')).toBe(true);
  });

  for (const { code, book } of shipped) {
    test(`${code}/${book.slug} is complete and attributed`, () => {
      expect(LEVELS).toContain(book.level);
      expect(book.sourceUrl).toStartWith('https://');
      expect(book.license.length).toBeGreaterThan(5);
      const loaded = loadLibraryBook(code, book.slug)!;
      expect(loaded.lessons.length).toBe(book.lessonCount);
      for (const lesson of loaded.lessons) {
        expect(lesson.markdown.length).toBeGreaterThan(200);
        expect(Buffer.byteLength(lesson.markdown)).toBeLessThan(1024 * 1024);
        expect(lesson.markdown).not.toMatch(/Project Gutenberg|\*\*\* (START|END) OF/i);
      }
    });

    test(`${code}/${book.slug} has a title and blurb in every native language`, () => {
      for (const native of NATIVE_LANGUAGES) {
        expect(`${native.code}: ${book.titles[native.code]?.trim() ?? ''}`).not.toBe(
          `${native.code}: `,
        );
        expect(`${native.code}: ${book.blurbs[native.code]?.trim() ?? ''}`).not.toBe(
          `${native.code}: `,
        );
      }
    });
  }
});
