import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import JsonLd from '@/components/JsonLd';
import { LegalShell, H2 } from '@/components/LegalLinks/shell';
import PublicLink from '@/components/PublicLink';
import {
  ALTERNATIVE_COMPETITORS,
  alternativePath,
  alternativesHubJsonLd,
  isWave3AlternativeCompetitor,
  type AlternativeCompetitor,
} from '@/lib/alternatives';
import { getWave3AlternativeContent } from '@/lib/alternatives-wave3';
import { getToolsUi } from '@/lib/tools';
import { findPrice, formatMoney, TIER_ALLOWANCES } from '@/lib/plan-prices';
import { fetchPlanPricesOnServer } from '@/lib/plan-prices.server';
import { listPublicBooks } from '@/lib/public-books';
import { publicUrl } from '@/lib/public-locale';
import { activePublicLocalePrefix, publicAlternatesForRequest } from '@/lib/public-locale.server';
import { buildPublicTwitter, withPublicOg } from '@/lib/site-seo';

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale, prices, { alternates, canonicalUrl }] = await Promise.all([
    getTranslations('alternatives'),
    getLocale(),
    fetchPlanPricesOnServer(),
    publicAlternatesForRequest('/alternatives'),
  ]);
  const plusMonthly = findPrice(prices, 'cloud', 'month')?.unitPrice;
  const plusPrice = plusMonthly ? formatMoney(plusMonthly, locale) : '$3';
  const books = listPublicBooks().length;
  const title = t('hub.metaTitle');
  const description = t('hub.metaDescription', { books, plusPrice });
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

const PLATFORM_COMPARISONS: readonly AlternativeCompetitor[] = [
  'lingq',
  'readlang',
  'lute',
  'duolingo',
];
const LANGUAGE_COMPARISONS: readonly AlternativeCompetitor[] = [
  'lingq-for-japanese',
  'lingq-for-korean',
  'lingq-for-french',
];

export default async function AlternativesHubPage() {
  const [t, locale, prices, localePrefix, { canonicalUrl }] = await Promise.all([
    getTranslations('alternatives'),
    getLocale(),
    fetchPlanPricesOnServer(),
    activePublicLocalePrefix(),
    publicAlternatesForRequest('/alternatives'),
  ]);
  const bookCount = listPublicBooks().length;
  const plusMonthly = findPrice(prices, 'cloud', 'month')?.unitPrice;
  const plusPriceText = plusMonthly ? formatMoney(plusMonthly, locale) : '$3';

  const rowValues = {
    books: bookCount,
    plusPrice: plusPriceText,
    freeLookups: TIER_ALLOWANCES.free.glosses.toLocaleString(locale),
    freeDetailed: TIER_ALLOWANCES.free.detailed,
  };

  const cardCopy = (competitor: AlternativeCompetitor) => {
    if (isWave3AlternativeCompetitor(competitor)) {
      const content = getWave3AlternativeContent(competitor, locale, rowValues);
      return {
        title: content.title,
        summary: content.summary,
        description: content.metaDescription,
      };
    }
    return {
      title: t(`${competitor}.title`),
      summary: t(`${competitor}.summary`, rowValues),
      description: t(`${competitor}.metaDescription`, {
        books: bookCount,
        plusPrice: plusPriceText,
      }),
    };
  };

  const title = t('hub.title');
  const description = t('hub.metaDescription', { books: bookCount, plusPrice: plusPriceText });

  const structured = alternativesHubJsonLd({
    url: canonicalUrl,
    title,
    description,
    homeLabel: t('breadcrumbHome'),
    hubLabel: t('hub.breadcrumbAlternatives'),
    localePrefix,
    inLanguage: locale,
    items: ALTERNATIVE_COMPETITORS.map((competitor) => {
      const copy = cardCopy(competitor);
      return {
        name: copy.title,
        url: publicUrl(alternativePath(competitor), localePrefix),
        description: copy.description,
      };
    }),
  });

  const renderGrid = (list: readonly AlternativeCompetitor[], testId: string) => (
    <div className="grid gap-6 sm:grid-cols-2" data-testid={testId}>
      {list.map((competitor) => {
        const copy = cardCopy(competitor);
        return (
          <section
            key={competitor}
            className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-6"
          >
            <div className="space-y-2">
              <H2>{copy.title}</H2>
              <p className="text-sm leading-relaxed text-muted-foreground">{copy.summary}</p>
            </div>
            <div>
              <PublicLink
                href={alternativePath(competitor)}
                className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                data-testid={`alt-hub-link-${competitor}`}
              >
                {t('hub.cardCta')}
              </PublicLink>
            </div>
          </section>
        );
      })}
    </div>
  );

  return (
    <LegalShell title={title} wide>
      {structured.map((entry, idx) => (
        <JsonLd key={idx} data={entry} />
      ))}

      <p className="max-w-3xl text-base text-muted-foreground">{t('hub.intro')}</p>

      {renderGrid(PLATFORM_COMPARISONS, 'alternatives-hub-cards')}

      <div className="space-y-4 pt-2">
        <H2>{getToolsUi(locale).languageGuidesHeading}</H2>
        {renderGrid(LANGUAGE_COMPARISONS, 'alternatives-hub-language-cards')}
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <PublicLink
          href="/books"
          className="inline-block rounded-lg border border-border bg-card px-4 py-2 font-semibold text-foreground hover:bg-muted"
        >
          {t('ctaBooks', { books: bookCount })}
        </PublicLink>
        <PublicLink
          href="/vocab-test"
          className="inline-block rounded-lg border border-border bg-card px-4 py-2 font-semibold text-foreground hover:bg-muted"
        >
          {t('ctaVocabTest')}
        </PublicLink>
        <PublicLink
          href="/tools/text-difficulty"
          className="inline-block rounded-lg border border-border bg-card px-4 py-2 font-semibold text-foreground hover:bg-muted"
        >
          {getToolsUi(locale).diffTitle}
        </PublicLink>
        <PublicLink
          href="/pricing"
          className="inline-block rounded-lg border border-border bg-card px-4 py-2 font-semibold text-foreground hover:bg-muted"
        >
          {t('seePricing')}
        </PublicLink>
        <Link
          href="/register"
          className="inline-block rounded-lg border border-border bg-card px-4 py-2 font-semibold text-foreground hover:bg-muted"
        >
          {t('ctaRegister')}
        </Link>
      </div>
    </LegalShell>
  );
}
