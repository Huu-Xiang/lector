'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { authHref, vocabReportResumeFromSearch, vocabReportReturnPath } from '@/lib/auth-return';
import { signOutAndForget } from '@/lib/sign-out';
import { saveVocabReport } from '@/lib/vocab-report-client';
import {
  clearVocabReportDraft,
  getVocabReportDraft,
  vocabReportAccountAction,
} from '@/lib/vocab-report-draft';
import { ReportEstimate, ReportHistoryLink, ReportRecord } from './ReportRecord';
import { ReportAuthChoices } from './SaveReport';
import type { VocabReport } from '../../../languages/en/vocab-report';

export default function ReportResume() {
  const t = useTranslations('vocabTest.report');
  const params = useSearchParams();
  const resume = vocabReportResumeFromSearch(params.toString());
  if (!resume) return null;
  if (resume.callbackError || !resume.attemptId) {
    return (
      <div
        className="space-y-3 rounded-xl border border-border bg-card p-4"
        data-testid="vocab-report-resume-error"
      >
        <p role="alert">{t(resume.callbackError ? 'verificationError' : 'draftMissing')}</p>
        {resume.callbackError && resume.attemptId && (
          <Link
            className="text-sm underline"
            href={authHref('/login', vocabReportReturnPath(resume.attemptId))}
            data-testid="vocab-report-login"
          >
            {t('login')}
          </Link>
        )}
      </div>
    );
  }
  return <ResumeDraft key={resume.attemptId} attemptId={resume.attemptId} />;
}

function ResumeDraft({ attemptId }: { attemptId: string }) {
  const t = useTranslations('vocabTest.report');
  const { data: session, isPending, error: sessionError } = authClient.useSession();
  const [draft, setDraft] = useState<ReturnType<typeof getVocabReportDraft> | undefined>(undefined);
  const [saved, setSaved] = useState<{ report: VocabReport; userId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const inFlight = useRef(false);
  const attemptedAutomatically = useRef(false);
  const user = session?.user ?? null;
  const action = vocabReportAccountAction(draft?.expectedEmail, user);
  const returnPath = vocabReportReturnPath(attemptId);

  useEffect(() => {
    setDraft(getVocabReportDraft(attemptId));
  }, [attemptId]);

  const submit = useCallback(async () => {
    if (!draft || !user || inFlight.current || (action !== 'ready' && action !== 'confirm')) return;
    inFlight.current = true;
    setError(false);
    setBusy(true);
    try {
      const report = await saveVocabReport(draft.snapshot, user.id);
      setSaved({ report, userId: user.id });
      clearVocabReportDraft(attemptId);
    } catch {
      setError(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [action, attemptId, draft, user]);

  useEffect(() => {
    if (!draft || isPending || action !== 'ready' || attemptedAutomatically.current) return;
    const timer = window.setTimeout(() => {
      attemptedAutomatically.current = true;
      void submit();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [action, draft, isPending, submit]);

  async function switchAccount() {
    setError(false);
    try {
      const result = await signOutAndForget();
      if (result.error) throw new Error('Could not sign out');
      window.location.assign(authHref('/login', returnPath));
    } catch {
      setError(true);
    }
  }

  if (draft === undefined || isPending) {
    return <p aria-live="polite">{t('loading')}</p>;
  }
  if (!draft || (saved && saved.userId !== user?.id)) {
    return (
      <div className="space-y-2 rounded-xl border border-border bg-card p-4">
        <p role="alert" data-testid="vocab-report-resume-error">
          {t('draftMissing')}
        </p>
        {user?.emailVerified && <ReportHistoryLink />}
      </div>
    );
  }
  if (saved && user) {
    return (
      <div className="space-y-3" data-testid="vocab-report-resume">
        <p className="font-medium" data-testid="vocab-report-saved">
          {t('saved')}
        </p>
        <ReportRecord report={saved.report} userId={user.id} />
        <ReportHistoryLink />
      </div>
    );
  }
  return (
    <section
      className="space-y-3 rounded-xl border border-border bg-card p-4"
      data-testid="vocab-report-resume"
    >
      <h2 className="text-lg font-semibold">{t('resumeTitle')}</h2>
      <p>
        <ReportEstimate score={draft.snapshot} />
      </p>
      <ResumeAccountAction
        action={action}
        email={user?.email ?? ''}
        error={error}
        busy={busy}
        sessionError={Boolean(sessionError)}
        returnPath={returnPath}
        onSave={() => void submit()}
        onSwitchAccount={() => void switchAccount()}
      />
      {error && (
        <p role="alert" className="text-destructive">
          {t('saveError')}
        </p>
      )}
      <Link className="block text-sm underline" href="/vocab-test">
        {t('back')}
      </Link>
    </section>
  );
}

function ResumeAccountAction({
  action,
  email,
  error,
  busy,
  sessionError,
  returnPath,
  onSave,
  onSwitchAccount,
}: {
  action: ReturnType<typeof vocabReportAccountAction>;
  email: string;
  error: boolean;
  busy: boolean;
  sessionError: boolean;
  returnPath: string;
  onSave: () => void;
  onSwitchAccount: () => void;
}) {
  const t = useTranslations('vocabTest.report');

  if (sessionError) {
    return (
      <p role="alert" className="text-destructive">
        {t('loadError')}
      </p>
    );
  }
  if (action === 'sign-in') return <ReportAuthChoices returnPath={returnPath} />;
  if (action === 'mismatch') {
    return (
      <>
        <p role="alert" data-testid="vocab-report-resume-error">
          {t('wrongAccount')}
        </p>
        <Button type="button" variant="outline" onClick={onSwitchAccount}>
          {t('switchAccount')}
        </Button>
      </>
    );
  }
  if (action === 'verify') {
    return (
      <p role="alert" data-testid="vocab-report-resume-error">
        {t('unverified')}
      </p>
    );
  }

  const needsConfirmation = action === 'confirm';
  if (!needsConfirmation && !error) return <p aria-live="polite">{t('saving')}</p>;

  return (
    <>
      {needsConfirmation && <p>{t('confirmEmail', { email })}</p>}
      <Button type="button" onClick={onSave} disabled={busy} data-testid="vocab-report-confirm">
        {busy ? t('saving') : t('save')}
      </Button>
    </>
  );
}
