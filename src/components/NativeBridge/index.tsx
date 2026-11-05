'use client';

import { useEffect } from 'react';
import { useLocale } from 'next-intl';
import { hideSplash, isNativeApp, saveNativeLocale, setStatusBarForTheme } from '@/lib/native-app';

/** Connects the web app to the iPhone shell. Renders nothing and does nothing on the web. */
export default function NativeBridge() {
  const locale = useLocale();

  useEffect(() => {
    if (!isNativeApp()) return;
    const root = document.documentElement;
    root.dataset.nativeApp = '';
    const viewport = document.querySelector('meta[name="viewport"]');
    const content = viewport?.getAttribute('content') ?? '';
    if (viewport && !content.includes('viewport-fit')) {
      viewport.setAttribute('content', `${content}, viewport-fit=cover`);
    }
    const syncTheme = () => void setStatusBarForTheme(root.classList.contains('dark'));
    syncTheme();
    void hideSplash();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    void saveNativeLocale(locale);
  }, [locale]);

  return null;
}
