import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://readfox.app';
  return ['/landing', '/privacy', '/terms', '/about'].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: 'monthly' as const,
  }));
}
