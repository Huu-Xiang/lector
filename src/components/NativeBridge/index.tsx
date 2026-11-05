'use client';

import { useEffect } from 'react';
import { useLocale } from 'next-intl';
import {
  hideSplash,
  isNativeApp,
  saveNativeLocale,
  setNativeAppearance,
  setStatusBarForTheme,
  useIsNativeApp,
} from '@/lib/native-app';
import { useLectorMode } from '@/lib/use-env';
import { listenForAppLinks, listenForNotificationTaps } from '@/lib/app-url';
import { rememberPendingShare } from '@/lib/share-import';
import { SETTINGS_KEYS } from '@/app/settings/constants';
import OfflineSync from './OfflineSync';
import NativeTabBarSync from './NativeTabBarSync';
import ReviewWidgetSync from './ReviewWidgetSync';

/** Connects the web app to the iPhone shell. Renders nothing and does nothing on the web. */
export default function NativeBridge() {
  const locale = useLocale();
  const inApp = useIsNativeApp();
  const mode = useLectorMode();

  useEffect(() => {
    if (!isNativeApp()) return;
    const root = document.documentElement;
    root.dataset.nativeApp = '';
    // Next rewrites the viewport tag on every route change, so keep `viewport-fit=cover` on it.
    const keepViewportFit = () => {
      const viewport = document.querySelector('meta[name="viewport"]');
      const content = viewport?.getAttribute('content') ?? '';
      if (viewport && !content.includes('viewport-fit')) {
        viewport.setAttribute('content', `${content}, viewport-fit=cover`);
      }
    };
    keepViewportFit();
    const headObserver = new MutationObserver(keepViewportFit);
    headObserver.observe(document.head, { childList: true, subtree: true, attributes: true });
    const syncTheme = () => {
      const dark = root.classList.contains('dark');
      void setStatusBarForTheme(dark);
      const chosen = localStorage.getItem(SETTINGS_KEYS.THEME);
      void setNativeAppearance(chosen === 'light' || chosen === 'dark' ? chosen : 'system');
    };
    syncTheme();
    void hideSplash();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => {
      observer.disconnect();
      headObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    void saveNativeLocale(locale);
  }, [locale]);

  useEffect(() => listenForNotificationTaps((path) => window.location.assign(path)), []);

  useEffect(
    () =>
      listenForAppLinks((path) => {
        if (path.startsWith('/share')) {
          rememberPendingShare(new URL(path, window.location.origin).searchParams.get('url'));
        }
        window.location.assign(path);
      }),
    [],
  );

  if (!inApp) return null;
  return (
    <>
      <NativeTabBarSync />
      <ReviewWidgetSync />
      {mode === 'cloud' && <OfflineSync />}
    </>
  );
}
