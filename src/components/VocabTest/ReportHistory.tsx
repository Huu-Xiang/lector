'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { authHref, VOCAB_REPORT_HISTORY_PATH } from '@/lib/auth-return';
import { useLectorMode } from '@/lib/use-env';
import { listVocabReports } from '@/lib/vocab-report-client';
import { ReportRecord } from './ReportRecord';
import type { VocabReport, VocabReportCursor } from '../../../languages/en/vocab-report';

const HISTORY_LOGIN = authHref('/login', VOCAB_REPORT_HISTORY_PATH);

export default function ReportHistory() {
  const t = useTranslations('vocabTest.report');
  const router = useRouter();
  const mode = useLectorMode();
  const { data: session, isPending, error } = authClient.useSession();
  const user = session?.user;
  const signedOut = mode === 'cloud' && !isPending && !user && (!error || error.status === 401);

  useEffect(() => {
    if (signedOut) router.replace(HISTORY_LOGIN);
  }, [router, signedOut]);

  if (mode !== 'cloud') return <p>{t('unavailable')}</p>;
  if (isPending) return <p aria-live="polite">{t('loading')}</p>;
  if (signedOut) return <Link href={HISTORY_LOGIN}>{t('login')}</Link>;
  if (error) return <p role="alert">{t('loadError')}</p>;
  if (!user?.emailVerified) return <p role="alert">{t('unverified')}</p>;
  return <AccountReports key={user.id} userId={user.id} />;
}

function AccountReports({ userId }: { userId: string }) {
  const t = useTranslations('vocabTest.report');
  const [reports, setReports] = useState<VocabReport[] | null>(null);
  const [error, setError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [nextCursor, setNextCursor] = useState<VocabReportCursor | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    listVocabReports(null, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) {
          setReports(result.reports);
          setNextCursor(result.nextCursor);
        }
      },
      () => {
        if (!controller.signal.aborted) setError(true);
      },
    );
    return () => controller.abort();
  }, [loadAttempt]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(false);
    try {
      const result = await listVocabReports(nextCursor);
      setReports((current) => (current ? [...current, ...result.reports] : result.reports));
      setNextCursor(result.nextCursor);
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="vocab-report-history">
      {error ? (
        <div className="space-y-2">
          <p role="alert" className="text-destructive">
            {t('loadError')}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setError(false);
              setLoadAttempt((value) => value + 1);
            }}
          >
            {t('reload')}
          </Button>
        </div>
      ) : reports === null ? (
        <p aria-live="polite">{t('loading')}</p>
      ) : reports.length === 0 ? (
        <p>{t('empty')}</p>
      ) : (
        <>
          {reports.map((report) => (
            <ReportRecord key={report.snapshot.attemptId} report={report} userId={userId} />
          ))}
          {nextCursor && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              data-testid="vocab-report-load-more"
            >
              {loadingMore ? t('loading') : t('loadMore')}
            </Button>
          )}
        </>
      )}
      <Link className="underline" href="/vocab-test">
        {t('back')}
      </Link>
    </div>
  );
}
