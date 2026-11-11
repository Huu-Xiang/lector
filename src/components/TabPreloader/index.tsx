'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { activeTenantId } from '@/lib/language-cache';
import { markVisited, preloadTabs } from '@/lib/tab-preload';

const FALLBACK_DELAY_MS = 1500;

/** Warms the other tabs' data and routes once the browser is idle after sign-in. */
export default function TabPreloader() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    markVisited(pathname);
    const userId = activeTenantId();
    if (!userId) return;
    const run = () => void preloadTabs(userId, pathname, (href) => router.prefetch(href));
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(run);
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(run, FALLBACK_DELAY_MS);
    return () => clearTimeout(id);
  }, [pathname, router]);

  return null;
}
