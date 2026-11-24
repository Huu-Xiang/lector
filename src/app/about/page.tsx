import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { LegalShell, H2 } from '@/components/LegalLinks/shell';
import { SOURCE_URL } from '@/components/LegalLinks';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legalPages');
  return {
    title: t('about.metaTitle'),
    description:
      'About Readfox: an open-source reader for learning languages from real books, with tap-to-translate, a vocabulary list and spaced-repetition review.',
    alternates: { canonical: '/about' },
  };
}

function externalLink(href: string) {
  return function ExternalLink(chunks: React.ReactNode) {
    return (
      <a className="underline" href={href} target="_blank" rel="noopener noreferrer">
        {chunks}
      </a>
    );
  };
}

export default async function AboutPage() {
  const [t, ta, locale] = await Promise.all([
    getTranslations('legalPages'),
    getTranslations('alternatives'),
    getLocale(),
  ]);
  const isEnglish = locale.startsWith('en');

  return (
    <LegalShell title={t('about.title')}>
      {!isEnglish && <p className="text-xs text-muted-foreground">{t('notice')}</p>}
      <p>{t('about.intro')}</p>

      <H2>{t('about.freeSoftware.heading')}</H2>
      <p>
        {t.rich('about.freeSoftware.license', {
          license: externalLink('https://www.gnu.org/licenses/agpl-3.0.html'),
          lector: externalLink('https://github.com/heuwels/lector'),
        })}
      </p>
      <p>
        {t.rich('about.freeSoftware.source', {
          url: SOURCE_URL,
          source: externalLink(SOURCE_URL),
        })}
      </p>

      <H2>{t('about.dataSources.heading')}</H2>
      <p>{t('about.dataSources.body')}</p>
      <p>{t('about.dataSources.dictionaries')}</p>
      <p>{t('about.dataSources.books')}</p>
      <p>{t('about.dataSources.readingFeed')}</p>

      <p className="flex flex-wrap gap-x-4 pt-2 text-xs text-muted-foreground">
        <Link href="/alternatives/lingq" className="underline hover:text-foreground">
          {ta('compareOther', { competitor: 'LingQ' })}
        </Link>
        <Link href="/alternatives/readlang" className="underline hover:text-foreground">
          {ta('compareOther', { competitor: 'Readlang' })}
        </Link>
      </p>
    </LegalShell>
  );
}
