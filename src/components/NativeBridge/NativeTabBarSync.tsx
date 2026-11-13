'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { isBareRoute } from '@/lib/auth-client';
import {
  configureNativeTabBar,
  hasNativeTabBar,
  onNativeTabSelected,
  selectNativeTab,
  setNativeTabBarVisible,
} from '@/lib/native-app';
import { coversTabBar, hasOwnHeader, ME_TAB, nativeTabs, selectedNativeTab } from './tab-bar';
import { useTabPreference } from './use-tab-preference';

/** Drives the shell's UITabBar from the web routes. Mounted only inside the app. */
export default function NativeTabBarSync() {
  const pathname = usePathname();
  const router = useRouter();
  const tNav = useTranslations('nav');
  const [ready] = useState(hasNativeTabBar);
  const [covered, setCovered] = useState(false);
  const wide = useWideScreen();
  const [extra] = useTabPreference();
  const tabs = useMemo(
    () =>
      nativeTabs(extra).map(({ href, labelKey, icon }) => ({
        id: href,
        title: tNav(labelKey),
        icon,
      })),
    [extra, tNav],
  );
  const selected = selectedNativeTab(pathname, extra);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.nativeTabbar = '';
    return onNativeTabSelected((id) => {
      if (id !== pathname && tabs.some((tab) => tab.id === id)) {
        router.replace(id, { scroll: id === ME_TAB.href });
      }
    });
  }, [ready, router, pathname, tabs]);

  useEffect(() => {
    if (!ready) return;
    void configureNativeTabBar(tabs, null);
  }, [ready, tabs]);

  useEffect(() => {
    if (ready) void selectNativeTab(selected);
  }, [ready, selected, tabs]);

  useEffect(() => {
    if (!ready) return;
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setCovered(coversTabBar(document)));
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-hidden', 'role', 'hidden', 'data-open'],
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [ready]);

  const visible = !isBareRoute(pathname) && !hasOwnHeader(pathname) && !covered && !wide;
  useEffect(() => {
    if (!ready) return;
    void setNativeTabBarVisible(visible);
    document.documentElement.toggleAttribute('data-native-tabbar-hidden', !visible);
  }, [ready, visible]);

  return null;
}

/** At `sm` and up the web sidebar shows, as on an iPad, so the tab bar steps aside. */
const WIDE = '(min-width: 40rem)';

function useWideScreen(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    },
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}
