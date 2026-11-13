'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { retryVocabReport } from '@/lib/vocab-report-client';
import type { VocabReport, VocabReportSnapshot } from '../../../languages/en/vocab-report';

type Estimate = Pick<VocabReportSnapshot, 'capped' | 'low' | 'high'>;

export function ReportEstimate({ score }: { score: Estimate }) {
  const t = useTranslations('vocabTest');
  if (score.capped) return t('estimateCapped');
  if (score.low === 0) return t('estimateRange', { high: score.high });
  return t('estimate', {
    count: (score.low + score.high) / 2,
    margin: (score.high - score.low) / 2,
  });
}

export function ReportStatus({ report, userId }: { report: VocabReport; userId: string }) {
  const t = useTranslations('vocabTest.report');
  const [status, setStatus] = useState(report.deliveryStatus);
  const [retryUntil, setRetryUntil] = useState(report.retryUntil);
  const [now, setNow] = useState(0);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const retrying = useRef(false);
  const visibleStatus =
    status === 'unknown' && retryUntil !== undefined && now >= retryUntil ? 'held' : status;

  useEffect(() => {
    if (status !== 'unknown' || retryUntil === undefined) return;
    setNow(Date.now());
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(0, retryUntil - Date.now()) + 1,
    );
    return () => window.clearTimeout(timer);
  }, [retryUntil, status]);

  async function retry() {
    if (retrying.current) return;
    retrying.current = true;
    setBusy(true);
    setError(false);
    try {
      const updated = await retryVocabReport(report.snapshot.attemptId, userId);
      setStatus(updated.deliveryStatus);
      setRetryUntil(updated.retryUntil);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
      retrying.current = false;
    }
  }

  return (
    <div className="space-y-2">
      <p aria-live="polite" className="text-muted-foreground" data-testid="vocab-report-status">
        {t(`status.${visibleStatus}`)}
      </p>
      {(visibleStatus === 'pending' ||
        visibleStatus === 'failed' ||
        visibleStatus === 'unknown') && (
        <Button
          type="button"
          variant="outline"
          onClick={() => void retry()}
          disabled={busy}
          data-testid="vocab-report-retry"
        >
          {busy ? t('retrying') : t('retry')}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {t('retryError')}
        </p>
      )}
    </div>
  );
}

export function ReportHistoryLink() {
  const t = useTranslations('vocabTest.report');
  return (
    <Link
      className="text-sm underline hover:text-foreground"
      href="/vocab-test/history"
      data-testid="vocab-report-history-link"
    >
      {t('history')}
    </Link>
  );
}

export function ReportRecord({ report, userId }: { report: VocabReport; userId: string }) {
  const t = useTranslations('vocabTest');
  const format = useFormatter();
  const { snapshot, books } = report;
  return (
    <section
      className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5"
      data-testid="vocab-report-record"
    >
      <div>
        <p className="text-sm text-muted-foreground">
          <time dateTime={snapshot.takenAt}>
            {format.dateTime(new Date(snapshot.takenAt), { dateStyle: 'medium' })}
          </time>
        </p>
        <h2 className="text-lg font-semibold">
          <ReportEstimate score={snapshot} />
        </h2>
        <p>{t('level', { level: snapshot.level })}</p>
      </div>
      {books.length > 0 && (
        <div>
          <h3 className="font-medium">{t('booksTitle')}</h3>
          <ul className="mt-1 space-y-1">
            {books.map((book) => (
              <li key={book.slug}>
                <Link className="underline" href={`/books/en/${book.slug}`}>
                  {book.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ReportStatus report={report} userId={userId} />
    </section>
  );
}
