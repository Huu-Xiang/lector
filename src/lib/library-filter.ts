export const LIBRARY_CATEGORIES = [
  'novel',
  'adventure',
  'children',
  'stories',
  'poetry',
  'philosophy',
  'nonfiction',
  'reader',
] as const;
export type LibraryCategory = (typeof LIBRARY_CATEGORIES)[number];

export interface FilterableBook {
  title: string;
  author: string;
  titles: Record<string, string>;
  level: string;
  category: string | null;
}

export function matchesQuery(book: FilterableBook, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [book.title, book.author, ...Object.values(book.titles)].some((text) =>
    text.toLocaleLowerCase().includes(needle),
  );
}

export function matchesFilters(
  book: FilterableBook,
  filters: { query: string; level: string | 'all'; category: LibraryCategory | 'all' },
): boolean {
  return (
    matchesQuery(book, filters.query) &&
    (filters.level === 'all' || book.level === filters.level) &&
    (filters.category === 'all' || book.category === filters.category)
  );
}

/** Books per category among those matching the query and level; the category itself is not applied. */
export function categoryCounts(
  books: FilterableBook[],
  filters: { query: string; level: string | 'all' },
): Record<LibraryCategory, number> {
  const counts = Object.fromEntries(LIBRARY_CATEGORIES.map((c) => [c, 0])) as Record<
    LibraryCategory,
    number
  >;
  for (const book of books) {
    if (!matchesFilters(book, { ...filters, category: 'all' })) continue;
    const category = book.category as LibraryCategory | null;
    if (category && category in counts) counts[category] += 1;
  }
  return counts;
}

/** Levels that have at least one book in the given category. */
export function levelsWithBooks(
  books: FilterableBook[],
  category: LibraryCategory | 'all',
): Set<string> {
  return new Set(
    books.filter((b) => category === 'all' || b.category === category).map((b) => b.level),
  );
}
