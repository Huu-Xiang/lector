import { Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { IEmptyStateProps } from './types';
import { Button } from '@/components/ui/button';

export default function EmptyState({
  onBackPressed,
  onLearnNewPressed,
  roundType,
}: IEmptyStateProps) {
  const t = useTranslations('practice.empty');
  return (
    <div className="py-8 text-center">
      <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--gold-soft)] text-[var(--gold-strong)]">
        <Clock className="h-8 w-8" />
      </div>
      <h2 className="mb-2 text-xl font-bold text-foreground">
        {roundType === 'review' ? t('reviewTitle') : t('newTitle')}
      </h2>
      <p className="mx-auto mb-6 max-w-xs text-sm text-muted-foreground">
        {roundType === 'review' ? t('reviewBody') : t('newBody')}
      </p>
      <div className="flex justify-center gap-3">
        <Button variant="secondary" type="button" onClick={onBackPressed}>
          {t('back')}
        </Button>
        {roundType === 'review' && (
          <Button type="button" onClick={onLearnNewPressed}>
            {t('learnNewInstead')}
          </Button>
        )}
      </div>
    </div>
  );
}
