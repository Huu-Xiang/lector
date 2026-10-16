'use client';

import { useTranslations } from 'next-intl';
import { useShowDescriptions } from '@/lib/show-descriptions';

export default function DescriptionToggle({ className = '' }: { className?: string }) {
  const t = useTranslations('descriptions');
  const [show, setShow] = useShowDescriptions();
  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground ${className}`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={show}
        aria-label={t('toggle')}
        onClick={() => setShow(!show)}
        data-testid="description-toggle"
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
          show ? 'bg-primary' : 'bg-muted'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform ${
            show ? 'translate-x-4' : ''
          }`}
        />
      </button>
      <span onClick={() => setShow(!show)}>{t('toggle')}</span>
    </label>
  );
}
