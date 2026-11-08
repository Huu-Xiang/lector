'use client';

import Link from 'next/link';
import { Gift } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { WELCOME_CODE, welcomeOfferOpen } from '@/lib/welcome-offer';

export default function WelcomeOfferNote({
  onUse,
  variant = 'card',
}: {
  onUse?: (code: string) => void;
  variant?: 'card' | 'bar';
}) {
  const t = useTranslations('welcomeOffer');
  const [open, setOpen] = useState(() => welcomeOfferOpen());
  useEffect(() => setOpen(welcomeOfferOpen()), []);
  if (!open) return null;
  return (
    <div
      className={
        variant === 'bar'
          ? 'flex items-center justify-center gap-2 border-b border-primary/30 bg-[var(--primary-soft)] px-4 py-2 text-center text-sm text-foreground'
          : 'flex items-start gap-2 rounded-lg border border-primary/40 bg-[var(--primary-soft)] p-3 text-sm text-foreground'
      }
      data-testid="welcome-offer"
    >
      <Gift className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <p className={variant === 'bar' ? '' : 'flex-1'}>
        {t.rich('body', {
          code: WELCOME_CODE,
          b: (chunks) => <span className="font-semibold">{chunks}</span>,
        })}{' '}
        {onUse ? (
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => onUse(WELCOME_CODE)}
            data-testid="welcome-offer-use"
          >
            {t('use')}
          </button>
        ) : (
          <Link
            href={`/register?invite=${WELCOME_CODE}`}
            className="font-medium text-primary hover:underline"
          >
            {t('signUp')}
          </Link>
        )}
      </p>
    </div>
  );
}
