'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { WordState } from '@/types';

export default function StateIndicator({ state }: { state: WordState }) {
  const t = useTranslations('vocab');
  switch (state) {
    case 'new':
      return (
        <span
          className="inline-block h-3 w-3 rounded-full bg-[var(--w-new-bd)]"
          title={t('stateTitle.new')}
        />
      );
    case 'level1':
      return (
        <span
          className="inline-block h-3 w-3 rounded-full bg-[var(--w-l1-bd)]"
          title={t('stateTitle.level1')}
        />
      );
    case 'level2':
      return (
        <span
          className="inline-block h-3 w-3 rounded-full bg-[var(--w-l2-bd)]"
          title={t('stateTitle.level2')}
        />
      );
    case 'level3':
      return (
        <span
          className="inline-block h-3 w-3 rounded-full bg-[var(--w-l3-bd)]"
          title={t('stateTitle.level3')}
        />
      );
    case 'level4':
      return (
        <span
          className="inline-block h-3 w-3 rounded-full bg-[var(--w-l4-bd)]"
          title={t('stateTitle.level4')}
        />
      );
    case 'known':
      return (
        <Check className="h-4 w-4 text-primary" strokeWidth={3} aria-label={t('states.known')}>
          <title>{t('stateTitle.known')}</title>
        </Check>
      );
    case 'ignored':
      return (
        <span
          className="inline-block h-0.5 w-3 rounded bg-muted-foreground"
          title={t('stateTitle.ignored')}
        />
      );
    default:
      return null;
  }
}
