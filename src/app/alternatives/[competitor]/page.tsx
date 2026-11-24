import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import AlternativesPage from '@/components/AlternativesPage';
import {
  ALTERNATIVE_COMPETITORS,
  alternativePath,
  isAlternativeCompetitor,
} from '@/lib/alternatives';
import { fetchPlanPricesOnServer } from '@/lib/plan-prices.server';
import { findPrice, formatMoney } from '@/lib/plan-prices';
import { listPublicBooks } from '@/lib/public-books';
import { publicAlternatesForRequest } from '@/lib/public-locale.server';

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
  const title = t(`${competitor}.metaTitle`);
  const description = t(`${competitor}.metaDescription`, { books, plusPrice });
  return {
    title,
    description,
    alternates,
    openGraph: { title, description, url: canonicalUrl, siteName: 'Readfox', type: 'website' },
  };
}

export default async function CompetitorAlternativeRoute({ params }: Props) {
  const { competitor } = await params;
  if (!isAlternativeCompetitor(competitor)) notFound();
  const [prices, { canonicalUrl }] = await Promise.all([
    fetchPlanPricesOnServer(),
    publicAlternatesForRequest(alternativePath(competitor)),
  ]);
  return <AlternativesPage competitor={competitor} prices={prices} canonicalUrl={canonicalUrl} />;
}
