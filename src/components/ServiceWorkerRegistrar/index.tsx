'use client';

import { useEffect } from 'react';
import { LAST_MODE_STORAGE_KEY } from '@/lib/api-base';
import { isNativeApp } from '@/lib/native-app';
import { getOfflineUser, setOfflineUser, waitForOfflineUser } from '@/lib/offline/identity';
import { syncOfflineWords } from '@/lib/offline/sync';

/** Registers the static-only PWA Service Worker on web and syncs queued offline words. */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const liveMode = window.__ENV__?.LECTOR_MODE;
    if (liveMode === 'cloud' || liveMode === 'selfhost') {
      try {
        window.localStorage.setItem(LAST_MODE_STORAGE_KEY, liveMode);
      } catch {
        // ignore storage errors
      }
      if (liveMode === 'selfhost') {
        setOfflineUser('local');
      }
    }

    if (isNativeApp()) {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .getRegistrations()
          .then((regs) => Promise.all(regs.map((r) => r.unregister())))
          .catch(() => {});
      }
      return;
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    let cancelled = false;

    const flush = (userId: string | null) => {
      if (cancelled || !userId || !navigator.onLine) return;
      void syncOfflineWords(userId);
    };

    if (navigator.onLine) {
      void waitForOfflineUser(5000).then((userId) => flush(userId));
    }

    const handleOnline = () => flush(getOfflineUser());
    window.addEventListener('online', handleOnline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return null;
}
