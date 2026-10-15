import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LegalShell } from '@/components/LegalLinks/shell';
import PricingTiers from './PricingTiers';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pricing');
  return { title: t('metaTitle'), alternates: { canonical: '/pricing' } };
}

export default async function PricingPage() {
  const t = await getTranslations('pricing');
  return (
    <LegalShell title={t('title')}>
      <p className="text-muted-foreground">{t('intro')}</p>
      <PricingTiers />
      <p className="text-xs text-muted-foreground">{t('notes')}</p>
    </LegalShell>
  );
}
