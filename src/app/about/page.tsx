import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import JsonLd from '@/components/JsonLd';
import { LegalShell, H2 } from '@/components/LegalLinks/shell';
import { SOURCE_URL } from '@/components/LegalLinks';
import PublicLink from '@/components/PublicLink';
import { publicAlternatesForRequest } from '@/lib/public-locale.server';
import { buildOrganizationJsonLd, buildPublicTwitter, withPublicOg } from '@/lib/site-seo';

export async function generateMetadata(): Promise<Metadata> {
  const [t, { alternates, canonicalUrl }] = await Promise.all([
    getTranslations('legalPages'),
    publicAlternatesForRequest('/about'),
  ]);
  const title = t('about.metaTitle');
  const description = t('about.metaDescription');
  return {
    title,
    description,
    alternates,
    openGraph: withPublicOg({
      title,
      description,
      url: canonicalUrl,
      siteName: 'Readfox',
      type: 'website',
    }),
    twitter: buildPublicTwitter(title, description),
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
  const [t, ta, locale, { canonicalUrl }] = await Promise.all([
    getTranslations('legalPages'),
    getTranslations('alternatives'),
    getLocale(),
    publicAlternatesForRequest('/about'),
  ]);
  const isEnglish = locale.startsWith('en');
  const aboutLd = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: t('about.title'),
    url: canonicalUrl,
    description: t('about.metaDescription'),
    inLanguage: locale,
    mainEntity: { '@id': 'https://readfox.app/#organization' },
  };

  return (
    <LegalShell title={t('about.title')}>
      <JsonLd data={aboutLd} />
      <JsonLd data={buildOrganizationJsonLd()} />
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
        <PublicLink href="/alternatives" className="underline hover:text-foreground">
          {ta('hub.breadcrumbAlternatives')}
        </PublicLink>
        <PublicLink href="/alternatives/lingq" className="underline hover:text-foreground">
          {ta('compareOther', { competitor: 'LingQ' })}
        </PublicLink>
        <PublicLink href="/alternatives/readlang" className="underline hover:text-foreground">
          {ta('compareOther', { competitor: 'Readlang' })}
        </PublicLink>
      </p>
    </LegalShell>
  );
}
