'use client';

import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { isBareRoute } from '@/lib/auth-client';
import {
  configureNativeTabBar,
  hasNativeTabBar,
  onNativeTabSelected,
  onNativeTabReselected,
  setNativeTabBadge,
  setNativeTabBarVisible,
  setNativeGlassTabFrame,
} from '@/lib/native-app';
import { coversTabBar, hasOwnHeader, ME_TAB, nativeTabs, selectedNativeTab } from './tab-bar';
import { useTabPreference } from './use-tab-preference';
import { iosAppearance, useIPadTopTabs } from './ipad-layout';
import { useReviewReady } from '@/components/NavHeader/useReviewReady';

/** Drives the shell's UITabBar from the web routes. Mounted only inside the app. */
export default function NativeTabBarSync() {
  const pathname = usePathname();
  const router = useRouter();
  const tNav = useTranslations('nav');
  const [ready] = useState(hasNativeTabBar);
  const [covered, setCovered] = useState(false);
  const ipadTopTabs = useIPadTopTabs();
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
  const dueCount = useReviewReady();
  const openTab = useEffectEvent((id: string) => {
    if (id !== pathname && tabs.some((tab) => tab.id === id)) {
      router.replace(id, { scroll: id === ME_TAB.href });
    }
  });
  const reselectTab = useEffectEvent((id: string) => {
    if (id !== selected || !tabs.some((tab) => tab.id === id)) return;
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  });

  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.nativeTabbar = '';
    const stopSelected = onNativeTabSelected((id) => openTab(id));
    const stopReselected = onNativeTabReselected((id) => reselectTab(id));
    return () => {
      stopSelected();
      stopReselected();
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    void configureNativeTabBar(tabs, selected);
  }, [ready, tabs, selected]);

  useEffect(() => {
    if (!ready) return;
    const target = tabs.some((tab) => tab.id === '/practice') ? '/practice' : ME_TAB.href;
    for (const tab of tabs) void setNativeTabBadge(tab.id, tab.id === target ? dueCount : 0);
  }, [ready, selected, tabs, dueCount]);

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

  const tabsAvailable = !isBareRoute(pathname) && !hasOwnHeader(pathname) && !covered;
  const visible = !ipadTopTabs && tabsAvailable;
  const useGlass = ready && ipadTopTabs && iosAppearance(navigator.userAgent) === 'glass';
  useEffect(() => {
    if (!useGlass || !tabsAvailable) return;
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let nav: HTMLElement | null = null;
    let raf = 0;
    let lastFrame = '';
    let request = 0;
    const resize = new ResizeObserver(schedule);
    const observer = new MutationObserver(schedule);

    async function update() {
      const next = document.querySelector<HTMLElement>('.ipad-tabs');
      if (next !== nav) {
        resize.disconnect();
        if (next) {
          resize.observe(next);
          const toolbar = next.closest('.native-topbar');
          if (toolbar) resize.observe(toolbar, { box: 'border-box' });
        }
        nav = next;
      }
      const rect = nav?.getBoundingClientRect();
      const frame =
        rect?.width && rect.height && (!viewport || viewport.scale === 1)
          ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          : null;
      const key = JSON.stringify(frame);
      if (key === lastFrame) return;
      lastFrame = key;
      const current = ++request;
      const shown = await setNativeGlassTabFrame(frame);
      if (current === request) root.toggleAttribute('data-native-glass-tabs', shown);
    }

    function schedule() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => void update());
    }

    observer.observe(document.body, { childList: true, subtree: true });
    viewport?.addEventListener('resize', schedule);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, { passive: true });
    schedule();

    return () => {
      request++;
      cancelAnimationFrame(raf);
      observer.disconnect();
      resize.disconnect();
      viewport?.removeEventListener('resize', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule);
      root.removeAttribute('data-native-glass-tabs');
      void setNativeGlassTabFrame(null);
    };
  }, [useGlass, tabsAvailable, pathname, tabs]);
  useEffect(() => {
    if (!ready) return;
    void setNativeTabBarVisible(visible);
    document.documentElement.toggleAttribute('data-native-tabbar-hidden', !visible);
  }, [ready, visible]);

  return null;
}
