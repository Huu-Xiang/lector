'use client';

import { useEffect } from 'react';
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
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

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
