import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LegalShell } from '@/components/LegalLinks/shell';
import CardPendingNote from './CardPendingNote';
import PricingTiers from './PricingTiers';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pricing');
  return {
    title: t('metaTitle'),
    description:
      'Readfox plans: start free with 1,000 AI word lookups a month, or upgrade to Plus, Pro or Max for more lookups, detailed explanations and an unlimited library. Alipay accepted.',
    alternates: { canonical: '/pricing' },
  };
}

export default async function PricingPage() {
  const t = await getTranslations('pricing');
  return (
    <LegalShell title={t('title')} wide>
      <p className="text-muted-foreground">{t('intro')}</p>
      <CardPendingNote />
      <PricingTiers />
      <p className="text-xs text-muted-foreground">{t('notes')}</p>
    </LegalShell>
  );
}
