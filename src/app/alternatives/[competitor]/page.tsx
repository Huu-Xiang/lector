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
  const [t, locale, prices] = await Promise.all([
    getTranslations('alternatives'),
    getLocale(),
    fetchPlanPricesOnServer(),
  ]);
  const plusMonthly = findPrice(prices, 'cloud', 'month')?.unitPrice;
  const plusPrice = plusMonthly ? formatMoney(plusMonthly, locale) : '$3';
  const books = listPublicBooks().length;
  const title = t(`${competitor}.metaTitle`);
  const description = t(`${competitor}.metaDescription`, { books, plusPrice });
  const url = alternativePath(competitor);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: 'Readfox', type: 'website' },
  };
}

export default async function CompetitorAlternativeRoute({ params }: Props) {
  const { competitor } = await params;
  if (!isAlternativeCompetitor(competitor)) notFound();
  const prices = await fetchPlanPricesOnServer();
  return <AlternativesPage competitor={competitor} prices={prices} />;
}
