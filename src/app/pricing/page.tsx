import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LegalShell } from '@/components/LegalLinks/shell';
import { fetchPlanPricesOnServer } from '@/lib/plan-prices.server';
import WelcomeOfferNote from '@/components/WelcomeOfferNote';
import CardPendingNote from './CardPendingNote';
import PricingTiers from './PricingTiers';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pricing');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: { canonical: '/pricing' },
  };
}

export default async function PricingPage() {
  const t = await getTranslations('pricing');
  const prices = await fetchPlanPricesOnServer();
  return (
    <LegalShell title={t('title')} wide>
      <p className="text-muted-foreground">{t('intro')}</p>
      <WelcomeOfferNote />
      <CardPendingNote />
      <PricingTiers initialPrices={prices} />
      <p className="text-xs text-muted-foreground">{t('notes')}</p>
    </LegalShell>
  );
}
