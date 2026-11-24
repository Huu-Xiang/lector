import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LegalShell } from '@/components/LegalLinks/shell';
import { fetchPlanPricesOnServer } from '@/lib/plan-prices.server';
import WelcomeOfferNote from '@/components/WelcomeOfferNote';
import NativeAppRedirect from '@/components/NativeAppRedirect';
import CardPendingNote from './CardPendingNote';
import PricingTiers from './PricingTiers';
import { publicAlternatesForRequest } from '@/lib/public-locale.server';

export async function generateMetadata(): Promise<Metadata> {
  const [t, { alternates }] = await Promise.all([
    getTranslations('pricing'),
    publicAlternatesForRequest('/pricing'),
  ]);
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates,
  };
}

export default async function PricingPage() {
  const [t, ta, prices] = await Promise.all([
    getTranslations('pricing'),
    getTranslations('alternatives'),
    fetchPlanPricesOnServer(),
  ]);
  return (
    <LegalShell title={t('title')} wide>
      <NativeAppRedirect to="/" />
      <p className="text-muted-foreground">{t('intro')}</p>
      <WelcomeOfferNote />
      <CardPendingNote />
      <PricingTiers initialPrices={prices} />
      <p className="text-xs text-muted-foreground">{t('notes')}</p>
      <p className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
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
