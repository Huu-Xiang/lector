import type { MetadataRoute } from 'next';
import {
  AUTHOR_PAGE_MIN_BOOKS,
  PUBLIC_BOOK_LANGUAGES,
  authorsOf,
  languagesWithBooks,
  levelSlug,
  listPublicBooks,
} from '@/lib/public-books';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://readfox.app';
  const pages = ['/', '/pricing', '/privacy', '/terms', '/refunds', '/about'].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: 'monthly' as const,
  }));
  const books = [
    { url: `${base}/books`, changeFrequency: 'weekly' as const },
    ...languagesWithBooks().map((language) => ({
      url: `${base}/books/${language}`,
      changeFrequency: 'weekly' as const,
    })),
    ...listPublicBooks().flatMap((book) => [
      { url: `${base}/books/${book.language}/${book.slug}`, changeFrequency: 'yearly' as const },
      {
        url: `${base}/books/${book.language}/${book.slug}/read`,
        changeFrequency: 'yearly' as const,
      },
    ]),
  ];
  const levels = [
    ...new Set(listPublicBooks().map((b) => `/books/${b.language}/level/${levelSlug(b.level)}`)),
  ].map((path) => ({ url: `${base}${path}`, changeFrequency: 'monthly' as const }));
  const authors = PUBLIC_BOOK_LANGUAGES.flatMap((language) => {
    const list = authorsOf(language);
    if (list.length === 0) return [];
    return [
      { url: `${base}/books/${language}/authors`, changeFrequency: 'monthly' as const },
      ...list
        .filter((a) => a.count >= AUTHOR_PAGE_MIN_BOOKS)
        .map((a) => ({
          url: `${base}/books/${language}/author/${encodeURIComponent(a.slug)}`,
          changeFrequency: 'monthly' as const,
        })),
    ];
  });
  return [...pages, ...books, ...levels, ...authors];
}
