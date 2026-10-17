import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://readfox.app';
  return ['/landing', '/pricing', '/privacy', '/terms', '/refunds', '/about'].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: 'monthly' as const,
  }));
}
