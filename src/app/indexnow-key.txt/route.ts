import { isNoIndexSite, validIndexNowKey } from '@/lib/site-seo';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  if (isNoIndexSite()) return new Response('Not found', { status: 404 });
  const key = validIndexNowKey();
  if (!key) return new Response('Not found', { status: 404 });
  return new Response(key, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
