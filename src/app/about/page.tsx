import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { LegalShell, H2 } from '@/components/LegalLinks/shell';
import { SOURCE_URL } from '@/components/LegalLinks';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legalPages');
  return { title: t('about.metaTitle') };
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
  const t = await getTranslations('legalPages');
  const locale = await getLocale();
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
    </LegalShell>
  );
}
