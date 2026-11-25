'use client';

import { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { getReviewCounts, peekReviewCounts, QUERY_SCOPES } from '@/lib/data-layer';
import { trackProductEvent } from '@/lib/product-analytics';
import { useActiveLanguage } from '@/utils/hooks';
import { useQueryRefresh } from '@/lib/use-query-refresh';
import type { ReviewCounts } from '@/types';

export default function WordReviewEntry({ onStart }: { onStart: () => void }) {
  const t = useTranslations('practice.words');
  const format = useFormatter();
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

  const nextDueLabel =
    counts?.nextDue && !ready
      ? format.dateTime(new Date(counts.nextDue), { dateStyle: 'medium', timeStyle: 'short' })
      : null;

  return (
    <section
      className="mb-5 rounded-2xl border border-primary/25 bg-card p-4 shadow-sm sm:mb-6 sm:p-5"
      data-testid="word-review-entry"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">{t('entry.title')}</h2>
          {counts === null ? (
            <div className="mt-1.5 h-4 w-44 animate-pulse rounded bg-muted" />
          ) : ready ? (
            <p className="mt-1 text-sm text-muted-foreground" data-testid="word-review-counts">
              {t('entry.ready', { due: counts.dueNow, fresh: counts.newAvailable })}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground" data-testid="word-review-empty">
              {nextDueLabel ? t('entry.nothingDue', { time: nextDueLabel }) : t('entry.noWords')}
            </p>
          )}
        </div>
        {ready && (
          <Button onClick={onStart} data-testid="word-review-open">
            <RotateCcw aria-hidden />
            {t('entry.open')}
          </Button>
        )}
      </div>
    </section>
  );
}
