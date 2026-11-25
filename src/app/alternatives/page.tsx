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
} from '@/lib/alternatives';
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
    items: ALTERNATIVE_COMPETITORS.map((competitor) => ({
      name: t(`${competitor}.title`),
      url: publicUrl(alternativePath(competitor), localePrefix),
      description: t(`${competitor}.metaDescription`, {
        books: bookCount,
        plusPrice: plusPriceText,
      }),
    })),
  });

  return (
    <LegalShell title={title} wide>
      {structured.map((entry, idx) => (
        <JsonLd key={idx} data={entry} />
      ))}

      <p className="max-w-3xl text-base text-muted-foreground">{t('hub.intro')}</p>

      <div className="grid gap-6 sm:grid-cols-2" data-testid="alternatives-hub-cards">
        {ALTERNATIVE_COMPETITORS.map((competitor) => (
          <section
            key={competitor}
            className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-6"
          >
            <div className="space-y-2">
              <H2>{t(`${competitor}.title`)}</H2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t(`${competitor}.summary`, rowValues)}
              </p>
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
        ))}
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
