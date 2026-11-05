'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { navLinks } from '@/components/NavHeader/constants';
import { isBareRoute } from '@/lib/auth-client';
import {
  configureNativeTabBar,
  hasNativeTabBar,
  onNativeTabSelected,
  selectNativeTab,
  setNativeTabBarVisible,
} from '@/lib/native-app';
import { coversTabBar, hasOwnHeader, TAB_ICONS } from './tab-bar';

/** Drives the shell's UITabBar from the web routes. Mounted only inside the app. */
export default function NativeTabBarSync() {
  const pathname = usePathname();
  const router = useRouter();
  const tNav = useTranslations('nav');
  const [ready] = useState(hasNativeTabBar);
  const [covered, setCovered] = useState(false);
  const wide = useWideScreen();
  const titles = navLinks.map((link) => tNav(link.labelKey)).join('\n');
  const selected = navLinks.some((link) => link.href === pathname) ? pathname : null;

  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.nativeTabbar = '';
    return onNativeTabSelected((id) => router.replace(id));
  }, [ready, router]);

  useEffect(() => {
    if (!ready) return;
    const names = titles.split('\n');
    const tabs = navLinks.map((link, i) => ({
      id: link.href,
      title: names[i],
      icon: TAB_ICONS[link.href],
    }));
    void configureNativeTabBar(tabs, null);
  }, [ready, titles]);

  useEffect(() => {
    if (ready) void selectNativeTab(selected);
  }, [ready, selected, titles]);

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
