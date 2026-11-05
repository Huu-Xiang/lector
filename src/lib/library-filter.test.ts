import { describe, expect, it } from 'vitest';
import {
  categoryCounts,
  levelsWithBooks,
  matchesFilters,
  type FilterableBook,
} from './library-filter';

const book = (over: Partial<FilterableBook>): FilterableBook => ({
  title: 'Walden',
  author: 'Thoreau',
  titles: { 'zh-CN': '瓦尔登湖' },
  level: 'C2',
  category: 'nonfiction',
  ...over,
});

const books = [
  book({}),
  book({ title: 'Apology', author: 'Plato', titles: {}, level: 'B2', category: 'philosophy' }),
  book({ title: 'Phaedo', author: 'Plato', titles: {}, level: 'C1', category: 'philosophy' }),
  book({ title: 'Emma', author: 'Austen', titles: {}, level: 'C1', category: 'novel' }),
  book({ title: 'Old', author: 'X', titles: {}, level: 'C1', category: null }),
];

describe('library filters', () => {
  it('combines query, level and category', () => {
    const all = { query: '', level: 'all', category: 'all' } as const;
    expect(books.filter((b) => matchesFilters(b, all))).toHaveLength(5);
    expect(
      books
        .filter((b) => matchesFilters(b, { ...all, category: 'philosophy' }))
        .map((b) => b.title),
    ).toEqual(['Apology', 'Phaedo']);
    expect(
      books
        .filter((b) => matchesFilters(b, { ...all, category: 'philosophy', level: 'C1' }))
        .map((b) => b.title),
    ).toEqual(['Phaedo']);
    expect(books.filter((b) => matchesFilters(b, { ...all, query: '瓦尔登' }))).toHaveLength(1);
  });

  it('counts per category for the chosen level and query, ignoring the category itself', () => {
    expect(categoryCounts(books, { query: '', level: 'all' })).toMatchObject({
      philosophy: 2,
      novel: 1,
      nonfiction: 1,
      stories: 0,
    });
    expect(categoryCounts(books, { query: '', level: 'C1' })).toMatchObject({
      philosophy: 1,
      novel: 1,
      nonfiction: 0,
    });
    expect(categoryCounts(books, { query: 'plato', level: 'all' }).philosophy).toBe(2);
  });

  it('lists the levels that have books in a category', () => {
    expect([...levelsWithBooks(books, 'philosophy')].sort()).toEqual(['B2', 'C1']);
    expect(levelsWithBooks(books, 'all').size).toBe(3);
  });
});
