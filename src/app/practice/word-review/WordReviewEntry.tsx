'use client';

import { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { getReviewCounts, peekReviewCounts, QUERY_SCOPES } from '@/lib/data-layer';
import { trackProductEvent } from '@/lib/product-analytics';
import { useActiveLanguage } from '@/utils/hooks';
import { useQueryRefresh } from '@/lib/use-query-refresh';
import type { ReviewCounts } from '@/types';

export default function WordReviewEntry({ onStart }: { onStart: () => void }) {
  const t = useTranslations('practice.words');
  const { code: language } = useActiveLanguage();
  const [snapshot, setSnapshot] = useState<{ language: string; counts: ReviewCounts | null }>(
    () => ({
      language,
      counts: peekReviewCounts() ?? null,
    }),
  );
  const reported = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    getReviewCounts()
      .then((counts) => live && setSnapshot({ language, counts }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [language]);
  useQueryRefresh([QUERY_SCOPES.review], () => {
    getReviewCounts()
      .then((counts) => setSnapshot({ language, counts }))
      .catch(() => undefined);
  });

  const counts = snapshot.language === language ? snapshot.counts : null;
  const ready = counts !== null && counts.dueNow + counts.newAvailable > 0;
  useEffect(() => {
    if (!counts || reported.current === language) return;
    reported.current = language;
    trackProductEvent({
      event: 'review_opened',
      language,
      outcome: ready ? 'available' : 'empty',
      value: Math.min(counts.dueNow, 1000),
    });
  }, [counts, language, ready]);
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
