import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import JsonLd from '@/components/JsonLd';
import { LegalShell } from '@/components/LegalLinks/shell';
import PublicLink from '@/components/PublicLink';
import { fetchPlanPricesOnServer } from '@/lib/plan-prices.server';
import { planName } from '@/lib/plan-names';
import type { PlanPrice } from '@/lib/plan-prices';
import { SITE_ORIGIN } from '@/lib/public-books';
import WelcomeOfferNote from '@/components/WelcomeOfferNote';
import NativeAppRedirect from '@/components/NativeAppRedirect';
import CardPendingNote from './CardPendingNote';
import PricingTiers from './PricingTiers';
import { publicAlternatesForRequest } from '@/lib/public-locale.server';
import { buildPublicTwitter, withPublicOg } from '@/lib/site-seo';

export async function generateMetadata(): Promise<Metadata> {
  const [t, { alternates, canonicalUrl }] = await Promise.all([
    getTranslations('pricing'),
    publicAlternatesForRequest('/pricing'),
  ]);
  const title = t('metaTitle');
  const description = t('metaDescription');
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

function buildPricingOffers(prices: PlanPrice[] | null, canonicalUrl: string) {
  const offers: Array<Record<string, unknown>> = [
    {
      '@type': 'Offer',
      name: `Readfox ${planName('free')}`,
      price: '0',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      url: canonicalUrl,
    },
  ];
  for (const item of prices ?? []) {
    if (!item.unitPrice) continue;
    const cents = Number(item.unitPrice.amount);
    if (!Number.isFinite(cents)) continue;
    const value = cents / 100;
    offers.push({
      '@type': 'Offer',
      name: `Readfox ${planName(item.plan)} (${item.cycle})`,
      price: Number.isInteger(value) ? String(value) : value.toFixed(2),
      priceCurrency: item.unitPrice.currencyCode,
      availability: 'https://schema.org/InStock',
      url: canonicalUrl,
    });
  }
  return offers;
}

export default async function PricingPage() {
  const [t, ta, locale, prices, { canonicalUrl }] = await Promise.all([
    getTranslations('pricing'),
    getTranslations('alternatives'),
    getLocale(),
    fetchPlanPricesOnServer(),
    publicAlternatesForRequest('/pricing'),
  ]);
  const softwareLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Readfox',
    url: canonicalUrl,
    inLanguage: locale,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web, iOS',
    description: t('metaDescription'),
    image: `${SITE_ORIGIN}/og.png`,
    offers: buildPricingOffers(prices, canonicalUrl),
    publisher: { '@id': 'https://readfox.app/#organization' },
  };
  return (
    <LegalShell title={t('title')} wide>
      <JsonLd data={softwareLd} />
      <NativeAppRedirect to="/" />
      <p className="text-muted-foreground">{t('intro')}</p>
      <WelcomeOfferNote />
      <CardPendingNote />
      <PricingTiers initialPrices={prices} />
      <p className="text-xs text-muted-foreground">{t('notes')}</p>
      <p className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
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
