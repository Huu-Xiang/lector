'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { getReviewCounts } from '@/lib/data-layer';
import { updateReviewWidget } from '@/lib/native-app';

const MIN_GAP_MS = 60_000;

/** Keeps the home screen widget's due count current. Mounted only inside the app. */
export default function ReviewWidgetSync() {
  const pathname = usePathname();
  const lastSent = useRef(0);
  const lastPath = useRef(pathname);

  useEffect(() => {
    const refresh = (force: boolean) => {
      if (!force && Date.now() - lastSent.current < MIN_GAP_MS) return;
      lastSent.current = Date.now();
      getReviewCounts()
        .then((counts) => updateReviewWidget(counts))
        .catch(() => {
          /* signed out or offline: the widget keeps its last count */
        });
    };
    const leftPractice = lastPath.current === '/practice' && pathname !== '/practice';
    lastPath.current = pathname;
    refresh(leftPractice);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh(false);
      else refresh(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [pathname]);

  return null;
}
