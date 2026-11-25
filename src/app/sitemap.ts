import type { MetadataRoute } from 'next';
import { ALTERNATIVE_COMPETITORS, alternativePath } from '@/lib/alternatives';
import {
  AUTHOR_PAGE_MIN_BOOKS,
  PUBLIC_BOOK_LANGUAGES,
  authorsOf,
  languagesWithBooks,
  levelSlug,
  listPublicBooks,
} from '@/lib/public-books';
import { publicUrl, sitemapLanguages } from '@/lib/public-locale';
import { siteLastModified } from '@/lib/site-seo';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = siteLastModified();
  const entry = (
    path: string,
    changeFrequency: 'weekly' | 'monthly' | 'yearly',
  ): MetadataRoute.Sitemap[number] => ({
    url: publicUrl(path),
    lastModified,
    changeFrequency,
    alternates: { languages: sitemapLanguages(path) },
  });

  const pages = [
    '/',
    '/pricing',
    '/privacy',
    '/terms',
    '/refunds',
    '/about',
    '/vocab-test',
    '/vocab-test/fr',
    '/vocab-test/es',
    '/alternatives',
    ...ALTERNATIVE_COMPETITORS.map((c) => alternativePath(c)),
  ].map((path) => entry(path, 'monthly'));

  const books = [
    entry('/books', 'weekly'),
    ...languagesWithBooks().map((language) => entry(`/books/${language}`, 'weekly')),
    ...listPublicBooks().flatMap((book) => [
      entry(`/books/${book.language}/${book.slug}`, 'yearly'),
      entry(`/books/${book.language}/${book.slug}/read`, 'yearly'),
    ]),
  ];

  const levels = [
    ...new Set(listPublicBooks().map((b) => `/books/${b.language}/level/${levelSlug(b.level)}`)),
  ].map((path) => entry(path, 'monthly'));

  const authors = PUBLIC_BOOK_LANGUAGES.flatMap((language) => {
    const list = authorsOf(language);
    if (list.length === 0) return [];
    return [
      entry(`/books/${language}/authors`, 'monthly'),
      ...list
        .filter((a) => a.count >= AUTHOR_PAGE_MIN_BOOKS)
        .map((a) => entry(`/books/${language}/author/${encodeURIComponent(a.slug)}`, 'monthly')),
    ];
  });

  return [...pages, ...books, ...levels, ...authors];
}
