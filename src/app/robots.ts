import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/pricing', '/privacy', '/terms', '/refunds', '/about', '/books', '/llms.txt'],
        disallow: ['/api/'],
      },
    ],
    sitemap: 'https://readfox.app/sitemap.xml',
  };
}
