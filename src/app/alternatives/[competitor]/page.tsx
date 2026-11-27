import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import AlternativesPage from '@/components/AlternativesPage';
import {
  ALTERNATIVE_COMPETITORS,
  alternativePath,
  isAlternativeCompetitor,
  isWave3AlternativeCompetitor,
} from '@/lib/alternatives';
import { getWave3AlternativeContent } from '@/lib/alternatives-wave3';
import { fetchPlanPricesOnServer } from '@/lib/plan-prices.server';
import { findPrice, formatMoney, TIER_ALLOWANCES } from '@/lib/plan-prices';
import { listPublicBooks } from '@/lib/public-books';
import { activePublicLocalePrefix, publicAlternatesForRequest } from '@/lib/public-locale.server';
import { buildPublicTwitter, withPublicOg } from '@/lib/site-seo';

interface Props {
  params: Promise<{ competitor: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return ALTERNATIVE_COMPETITORS.map((competitor) => ({ competitor }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { competitor } = await params;
  if (!isAlternativeCompetitor(competitor)) notFound();
  const url = alternativePath(competitor);
  const [t, locale, prices, { alternates, canonicalUrl }] = await Promise.all([
    getTranslations('alternatives'),
    getLocale(),
    fetchPlanPricesOnServer(),
    publicAlternatesForRequest(url),
  ]);
  const plusMonthly = findPrice(prices, 'cloud', 'month')?.unitPrice;
  const plusPrice = plusMonthly ? formatMoney(plusMonthly, locale) : '$3';
  const books = listPublicBooks().length;

  let title: string;
  let description: string;
  if (isWave3AlternativeCompetitor(competitor)) {
    const content = getWave3AlternativeContent(competitor, locale, {
      books,
      plusPrice,
      freeLookups: TIER_ALLOWANCES.free.glosses.toLocaleString(locale),
      freeDetailed: TIER_ALLOWANCES.free.detailed,
    });
    title = content.metaTitle;
    description = content.metaDescription;
  } else {
    title = t(`${competitor}.metaTitle`);
    description = t(`${competitor}.metaDescription`, { books, plusPrice });
  }

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

export default async function CompetitorAlternativeRoute({ params }: Props) {
  const { competitor } = await params;
  if (!isAlternativeCompetitor(competitor)) notFound();
  const [prices, localePrefix, { canonicalUrl }] = await Promise.all([
    fetchPlanPricesOnServer(),
    activePublicLocalePrefix(),
    publicAlternatesForRequest(alternativePath(competitor)),
  ]);
  return (
    <AlternativesPage
      competitor={competitor}
      prices={prices}
      canonicalUrl={canonicalUrl}
      localePrefix={localePrefix}
    />
  );
}
