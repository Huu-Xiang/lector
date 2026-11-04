'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { getReviewCounts, getReviewGoal } from '@/lib/data-layer';
import type { ReviewCounts, ReviewGoal } from '@/types';

export default function WordReviewEntry({ onStart }: { onStart: () => void }) {
  const t = useTranslations('practice.words');
  const format = useFormatter();
  const [counts, setCounts] = useState<ReviewCounts | null>(null);
  const [failed, setFailed] = useState(false);
  const [goal, setGoal] = useState<ReviewGoal>('recognize');

  useEffect(() => {
    let live = true;
    getReviewCounts()
      .then((value) => live && setCounts(value))
      .catch(() => live && setFailed(true));
    getReviewGoal()
      .then((value) => live && setGoal(value))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const ready = counts !== null && counts.dueNow + counts.newAvailable > 0;

  let body: React.ReactNode;
  if (failed) {
    body = <p className="text-sm text-muted-foreground">{t('entry.failed')}</p>;
  } else if (!counts) {
    body = (
      <div
        className="h-5 w-48 animate-pulse rounded bg-muted"
        role="status"
        aria-label={t('loading')}
      />
    );
  } else if (ready) {
    body = (
      <p className="text-sm text-muted-foreground" data-testid="word-review-counts">
        {t('entry.ready', { due: counts.dueNow, fresh: counts.newAvailable })}
      </p>
    );
  } else if (counts.nextDue) {
    body = (
      <p className="text-sm text-muted-foreground">
        {t('entry.nothingDue', {
          time: format.dateTime(new Date(counts.nextDue), {
            dateStyle: 'medium',
            timeStyle: 'short',
          }),
        })}
      </p>
    );
  } else {
    body = <p className="text-sm text-muted-foreground">{t('entry.noWords')}</p>;
  }

  return (
    <div
      className="mb-8 rounded-2xl border border-border bg-card p-5"
      data-testid="word-review-entry"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="mb-1 text-base font-semibold text-foreground">{t('entry.title')}</h2>
          {body}
        </div>
        {ready && (
          <Button onClick={onStart} data-testid="word-review-open">
            {t('entry.open')}
          </Button>
        )}
      </div>
      <Link
        href="/settings#review-goal"
        className="mt-3 inline-block text-xs text-muted-foreground underline-offset-4 hover:underline"
        data-testid="word-review-goal-link"
      >
        {t('entry.goal', { goal: t(`goal.${goal}`) })}
      </Link>
    </div>
  );
}
