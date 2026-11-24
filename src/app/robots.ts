import type { MetadataRoute } from 'next';
import { isNoIndexSite } from '@/lib/site-seo';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  if (isNoIndexSite()) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
    };
  }
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/pricing',
          '/privacy',
          '/terms',
          '/refunds',
          '/about',
          '/books',
          '/vocab-test',
          '/alternatives',
          '/llms.txt',
          '/indexnow-key.txt',
        ],
        disallow: ['/api/', '/admin', '/checkout', '/claim-book', '/settings', '/subscribe'],
      },
    ],
    sitemap: 'https://readfox.app/sitemap.xml',
  };
}
