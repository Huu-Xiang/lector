'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, MessageCircle, Settings } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import LanguageSelector from '@/components/LanguageSelector';
import WhatsNew from '@/components/WhatsNew';
import { haptic, hasNativeTabBar, useIsNativeApp } from '@/lib/native-app';
import {
  hasOwnHeader,
  ME_TAB,
  nativeTabs,
  selectedNativeTab,
} from '@/components/NativeBridge/tab-bar';
import { useTabPreference } from '@/components/NativeBridge/use-tab-preference';
import { navLinks } from '../../constants';
import AccountMenu from '../AccountMenu';
import { CHAT_TOGGLE_EVENT } from '@/components/ChatWidget/constants';

/**
 * The iOS-style bar shown instead of the web top bar inside the app. At rest it has no
 * background and the page's own heading is the title; once the page scrolls, the bar blurs
 * the content under it and shows the small title (globals.css, `data-scrolled`).
 */
export default function NativeTopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const tNav = useTranslations('nav');
  const tChat = useTranslations('chat');
  const inApp = useIsNativeApp();
  const [extra] = useTabPreference();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!inApp) return;
    const update = () => setScrolled(window.scrollY > 4);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [inApp, pathname]);

  if (!inApp || hasOwnHeader(pathname)) return null;
  const nativeBar = hasNativeTabBar();
  const tab = nativeBar
    ? nativeTabs(extra).find((link) => link.href === pathname)
    : navLinks.find((link) => link.href === pathname && link.href !== '/settings');
  const titled = [ME_TAB, ...navLinks].find((link) => link.href === pathname);

  return (
    <header
      data-scrolled={scrolled || undefined}
      className="native-topbar group sticky top-0 isolate z-40 items-end pt-[env(safe-area-inset-top)]"
    >
      <div className="grid h-11 w-full grid-cols-[1fr_auto_1fr] items-center px-2">
        <div className="flex items-center justify-start">
          {pathname === ME_TAB.href ? null : tab ? (
            <LanguageSelector compact />
          ) : (
            <button
              type="button"
              onClick={() => {
                void haptic();
                if (pathname.startsWith('/collection/')) {
                  router.replace('/');
                } else if (nativeBar && selectedNativeTab(pathname, extra) === ME_TAB.href) {
                  router.replace(ME_TAB.href);
                } else {
                  router.back();
                }
              }}
              aria-label={tNav('back')}
              className="flex size-11 items-center justify-center text-primary active:opacity-60"
              data-testid="native-back"
            >
              <ChevronLeft className="size-7" strokeWidth={2.25} aria-hidden />
            </button>
          )}
        </div>
        <span
          aria-hidden
          className="truncate text-[17px] font-semibold text-foreground opacity-0 transition-opacity duration-200 group-data-[scrolled]:opacity-100"
        >
          {titled ? tNav(titled.labelKey) : ''}
        </span>
        <div className="flex items-center justify-end gap-1">
          <WhatsNew variant="topbar" />
          {!nativeBar && <AccountMenu compact />}
          <button
            type="button"
            aria-label={tChat('open')}
            onClick={() => {
              void haptic();
              window.dispatchEvent(new Event(CHAT_TOGGLE_EVENT));
            }}
            className="flex size-11 items-center justify-center text-foreground active:opacity-60"
            data-testid="native-chat"
          >
            <MessageCircle className="size-[22px]" aria-hidden />
          </button>
          {tab && !nativeBar && (
            <Link
              href="/settings"
              aria-label={tNav('settings')}
              onClick={() => void haptic()}
              className="flex size-11 items-center justify-center text-foreground active:opacity-60"
              data-testid="native-settings"
            >
              <Settings className="size-[22px]" aria-hidden />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
