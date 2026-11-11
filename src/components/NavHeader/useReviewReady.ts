'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { VOCAB_SAVED_EVENT } from '@/constants/storage';
import { getReviewCounts, QUERY_SCOPES } from '@/lib/data-layer';
import { isBareRoute } from '@/lib/auth-client';
import { reviewReadyCount } from '@/lib/review-badge';
import { useQueryRefresh } from '@/lib/use-query-refresh';

const SAVE_DEBOUNCE_MS = 800;

export function useReviewReady(): number {
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  const bare = isBareRoute(pathname);

  useEffect(() => {
    if (bare) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = (fresh = false) => {
      getReviewCounts({ fresh })
        .then((counts) => live && setCount(reviewReadyCount(counts)))
        .catch(() => undefined);
    };
    const onSaved = () => {
      clearTimeout(timer);
      timer = setTimeout(() => load(true), SAVE_DEBOUNCE_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    load();
    window.addEventListener(VOCAB_SAVED_EVENT, onSaved);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      live = false;
      clearTimeout(timer);
      window.removeEventListener(VOCAB_SAVED_EVENT, onSaved);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [bare, pathname]);

  useQueryRefresh([QUERY_SCOPES.review], () => {
    if (bare) return;
    getReviewCounts()
      .then((counts) => setCount(reviewReadyCount(counts)))
      .catch(() => undefined);
  });

  return bare ? 0 : count;
}
