import '../test-guard';
import { describe, expect, test } from 'bun:test';
import { getAllLanguages } from './languages';
import { listLibraryBooks, loadLibraryBook } from './library-content';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

describe('shipped library books', () => {
  const shipped = getAllLanguages().flatMap((lang) =>
    listLibraryBooks(lang.code).map((book) => ({ code: lang.code, book })),
  );

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
  }
});
