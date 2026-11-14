'use client';

import { useEffect, useEffectEvent, useMemo, useState } from 'react';
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
  const openTab = useEffectEvent((id: string) => {
    if (id !== pathname && tabs.some((tab) => tab.id === id)) {
      router.replace(id, { scroll: id === ME_TAB.href });
    }
  });

  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.nativeTabbar = '';
    return onNativeTabSelected((id) => openTab(id));
  }, [ready]);

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

  const visible = !isBareRoute(pathname) && !hasOwnHeader(pathname) && !covered;
  useEffect(() => {
    if (!ready) return;
    void setNativeTabBarVisible(visible);
    document.documentElement.toggleAttribute('data-native-tabbar-hidden', !visible);
  }, [ready, visible]);

  return null;
}
