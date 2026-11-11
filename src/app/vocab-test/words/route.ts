import { loadVocabTestData } from '@/lib/vocab-test-data';

export const dynamic = 'force-static';

export function GET() {
  const data = loadVocabTestData();
  if (!data) return new Response('Not found', { status: 404 });
  return Response.json(data, {
    headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
  });
}
