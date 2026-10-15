import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/landing', '/pricing', '/privacy', '/terms', '/about'],
        disallow: ['/api/'],
      },
    ],
    sitemap: 'https://readfox.app/sitemap.xml',
  };
}
