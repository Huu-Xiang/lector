import { NextResponse, type NextRequest } from 'next/server';
import { isDifficultyLanguage } from '@/lib/text-difficulty';
import { loadDifficultyLexicon } from '@/lib/text-difficulty-data';

export function GET(request: NextRequest) {
  const rawLang = (request.nextUrl.searchParams.get('lang') ?? 'en').toLowerCase();
  if (!isDifficultyLanguage(rawLang)) {
    return NextResponse.json(
      { error: 'Unsupported language' },
      { status: 400, headers: { 'X-Robots-Tag': 'noindex, nofollow' } },
    );
  }
  const locale = (request.nextUrl.searchParams.get('locale') ?? '').toLowerCase();
  const includeZh = rawLang === 'en' && (locale === '' || locale.startsWith('zh'));
  const entries = loadDifficultyLexicon(rawLang, { includeZh });
  return NextResponse.json(
    { language: rawLang, count: Object.keys(entries).length, entries },
    {
      headers: {
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    },
  );
}
