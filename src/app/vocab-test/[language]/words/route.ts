import { loadVocabTestData } from '@/lib/vocab-test-data';

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return [{ language: 'fr' }, { language: 'es' }];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ language: string }> },
) {
  const { language } = await params;
  if (language !== 'fr' && language !== 'es') {
    return new Response('Not found', { status: 404 });
  }
  const data = loadVocabTestData('en', language);
  if (!data) return new Response('Not found', { status: 404 });
  return Response.json(data, {
    headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
  });
}
