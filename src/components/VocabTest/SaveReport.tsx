'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button, buttonVariants } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { authHref, vocabReportReturnPath } from '@/lib/auth-return';
import { saveVocabReport } from '@/lib/vocab-report-client';
import { stageVocabReportDraft } from '@/lib/vocab-report-draft';
import { ReportHistoryLink, ReportStatus } from './ReportRecord';
import type { VocabReport, VocabReportSnapshot } from '../../../languages/en/vocab-report';

export function ReportAuthChoices({ returnPath }: { returnPath: string }) {
  const t = useTranslations('vocabTest.report');
  return (
    <div className="space-y-2" data-testid="vocab-report-auth-prompt">
      <p className="text-sm text-muted-foreground">{t('authPrompt')}</p>
      <div className="flex flex-wrap gap-2">
        <Link
          href={authHref('/login', returnPath)}
          className={buttonVariants({ variant: 'outline' })}
          data-testid="vocab-report-login"
        >
          {t('login')}
        </Link>
        <Link
          href={authHref('/register', returnPath)}
          className={buttonVariants()}
          data-testid="vocab-report-register"
        >
          {t('register')}
        </Link>
      </div>
    </div>
  );
}

export default function SaveReport({
  createSnapshot,
}: {
  createSnapshot: () => VocabReportSnapshot;
}) {
  const t = useTranslations('vocabTest.report');
  const { data: session, isPending, error: sessionError } = authClient.useSession();
  const [authReturn, setAuthReturn] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ report: VocabReport; userId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'saveError' | 'storageError' | 'unverified' | null>(null);
  const saving = useRef(false);
  const snapshotRef = useRef<VocabReportSnapshot | null>(null);
  const user = session?.user;

  async function save() {
    if (saving.current) return;
    setError(null);
    const snapshot = (snapshotRef.current ??= createSnapshot());
    if (!user) {
      if (!stageVocabReportDraft(snapshot)) {
        setError('storageError');
        return;
      }
      setAuthReturn(vocabReportReturnPath(snapshot.attemptId));
      return;
    }
    if (!user.emailVerified) {
      setError('unverified');
      return;
    }
    saving.current = true;
    setBusy(true);
    try {
      const report = await saveVocabReport(snapshot, user.id);
      setSaved({ report, userId: user.id });
    } catch {
      setError('saveError');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      {saved && saved.userId === user?.id ? (
        <>
          <p className="font-medium" data-testid="vocab-report-saved">
            {t('saved')}
          </p>
          <ReportStatus report={saved.report} userId={saved.userId} />
          <ReportHistoryLink />
        </>
      ) : (
        <>
          {!authReturn && (
            <Button
              type="button"
              size="lg"
              className="min-h-11"
              onClick={() => void save()}
              disabled={isPending || busy}
              data-testid="vocab-save-report"
            >
              {busy ? t('saving') : t('save')}
            </Button>
          )}
          {authReturn && <ReportAuthChoices returnPath={authReturn} />}
          {(error || sessionError) && (
            <p role="alert" className="text-sm text-destructive">
              {t(error ?? 'saveError')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
