'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export default function RouteErrorView({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('chrome.error');

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <h1 className="text-xl font-bold text-foreground">{t('title')}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t('body')}</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <Button type="button" onClick={reset}>
          {t('retry')}
        </Button>
        <Link
          href="/"
          className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
        >
          {t('backToLibrary')}
        </Link>
      </div>
    </main>
  );
}
