import type { MetadataRoute } from 'next';
import { listPublicBooks } from '@/lib/public-books';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://readfox.app';
  const pages = ['/landing', '/pricing', '/privacy', '/terms', '/refunds', '/about'].map(
    (path) => ({ url: `${base}${path}`, changeFrequency: 'monthly' as const }),
  );
  const books = [
    { url: `${base}/books`, changeFrequency: 'weekly' as const },
    ...listPublicBooks().map((book) => ({
      url: `${base}/books/${book.language}/${book.slug}`,
      changeFrequency: 'yearly' as const,
    })),
  ];
  return [...pages, ...books];
}
