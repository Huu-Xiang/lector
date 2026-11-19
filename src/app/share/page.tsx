'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { extractArticle } from '@/components/WebImportModal/utils';
import { createStandaloneLesson, getActiveLanguage } from '@/lib/data-layer';
import { isNativeApp } from '@/lib/native-app';
import { trackProductEvent } from '@/lib/product-analytics';
import {
  clearPendingShare,
  importSharedArticle,
  parseSharedUrl,
  peekPendingShare,
} from '@/lib/share-import';

type State = { phase: 'working' } | { phase: 'error'; message: string | null };

function ShareImport() {
  const t = useTranslations('share');
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState<State>({ phase: 'working' });
  const started = useRef(false);

  const run = useCallback(async () => {
    const url = parseSharedUrl(params.get('url')) ?? peekPendingShare();
    if (!url) {
      setState({ phase: 'error', message: t('invalid') });
      return;
    }
    const event = { language: getActiveLanguage(), feature: 'web' };
    trackProductEvent({ ...event, event: 'import_started' });
    const result = await importSharedArticle(url, {
      extract: extractArticle,
      create: createStandaloneLesson,
    });
    trackProductEvent({
      ...event,
      event: 'import_finished',
      outcome: result.ok ? 'success' : 'failure',
    });
    if (result.ok) {
      clearPendingShare();
      router.replace(`/read/${result.lessonId}`);
    } else {
      setState({ phase: 'error', message: result.message });
    }
  }, [params, router, t]);

  const retry = () => {
    setState({ phase: 'working' });
    void run();
  };

  useEffect(() => {
    // Only the iPhone app imports from a shared link; the web goes to the library.
    if (!isNativeApp()) {
      router.replace('/');
      return;
    }
    if (started.current) return;
    started.current = true;
    void Promise.resolve().then(run);
  }, [router, run]);

  if (state.phase === 'working') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <Spinner size="lg" label={t('working')} className="text-primary" />
        <p className="text-sm text-muted-foreground">{t('working')}</p>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center"
      data-testid="share-error"
    >
      <h1 className="text-lg font-semibold text-foreground">{t('errorTitle')}</h1>
      {state.message && <p className="text-sm text-muted-foreground">{state.message}</p>}
      <div className="flex gap-2 pt-2">
        <Button onClick={retry}>{t('retry')}</Button>
        <Button variant="outline" onClick={() => router.replace('/')}>
          {t('library')}
        </Button>
      </div>
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={null}>
      <ShareImport />
    </Suspense>
  );
}
