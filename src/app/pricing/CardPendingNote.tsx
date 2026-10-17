'use client';

import { useTranslations } from 'next-intl';
import { useCardPaymentsPending } from '@/lib/use-env';

export default function CardPendingNote() {
  const t = useTranslations('pricing');
  const pending = useCardPaymentsPending();
  if (!pending) return null;
  return (
    <p
      className="rounded-lg border border-border bg-card p-3 text-sm"
      data-testid="pricing-card-pending"
    >
      {t('cardPending')}
    </p>
  );
}
