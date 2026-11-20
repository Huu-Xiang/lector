'use client';

import { useEffect } from 'react';
import { LAST_MODE_STORAGE_KEY } from '@/lib/api-base';
import { isNativeApp } from '@/lib/native-app';
import { getOfflineUser } from '@/lib/offline/identity';
import { syncOfflineWords } from '@/lib/offline/sync';

/**
 * Registers the static-only PWA Service Worker on web browsers and syncs queued
 * offline words on reconnect. Inside the Capacitor iOS shell, proactively
 * unregisters any lingering Service Worker so the native offline stack stays
 * the sole owner.
 */
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
    }

    if (!('serviceWorker' in navigator)) return;

    if (isNativeApp()) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {});
      return;
    }

    navigator.serviceWorker.register('/sw.js').catch(() => {});

    const handleOnline = () => {
      const userId = getOfflineUser();
      if (userId) void syncOfflineWords(userId);
    };
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return null;
}
