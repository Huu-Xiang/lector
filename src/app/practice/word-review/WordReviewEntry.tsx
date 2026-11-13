'use client';

import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { getReviewCounts, peekReviewCounts, QUERY_SCOPES } from '@/lib/data-layer';
import { useQueryRefresh } from '@/lib/use-query-refresh';
import type { ReviewCounts } from '@/types';

export default function WordReviewEntry({ onStart }: { onStart: () => void }) {
  const t = useTranslations('practice.words');
  const [counts, setCounts] = useState<ReviewCounts | null>(() => peekReviewCounts() ?? null);

  useEffect(() => {
    let live = true;
    getReviewCounts()
      .then((value) => live && setCounts(value))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  useQueryRefresh([QUERY_SCOPES.review], () => {
    getReviewCounts()
      .then(setCounts)
      .catch(() => undefined);
  });

  const ready = counts !== null && counts.dueNow + counts.newAvailable > 0;
  if (!ready) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3" data-testid="word-review-entry">
      <Button variant="outline" onClick={onStart} data-testid="word-review-open">
        <RotateCcw aria-hidden />
        {t('entry.open')}
      </Button>
      <p className="text-xs text-muted-foreground" data-testid="word-review-counts">
        {t('entry.ready', { due: counts.dueNow, fresh: counts.newAvailable })}
      </p>
    </div>
  );
}
