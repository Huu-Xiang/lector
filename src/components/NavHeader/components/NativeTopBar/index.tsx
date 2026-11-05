'use client';

import { ChevronLeft } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import LanguageSelector from '@/components/LanguageSelector';
import WhatsNew from '@/components/WhatsNew';
import { haptic, useIsNativeApp } from '@/lib/native-app';
import { hasOwnHeader } from '@/components/NativeBridge/tab-bar';
import { navLinks } from '../../constants';
import AccountMenu from '../AccountMenu';

/** The iOS-style bar shown instead of the web top bar inside the app. */
export default function NativeTopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const tNav = useTranslations('nav');
  const inApp = useIsNativeApp();
  const tab = navLinks.find((link) => link.href === pathname);
  if (!inApp || hasOwnHeader(pathname)) return null;

  return (
    <header className="native-topbar sticky top-0 z-40 items-end border-b-[0.5px] border-border/80 bg-background/75 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150 sm:hidden print:hidden">
      <div className="grid h-11 w-full grid-cols-[1fr_auto_1fr] items-center px-2">
        <div className="flex items-center justify-start">
          {tab ? (
            <LanguageSelector compact />
          ) : (
            <button
              type="button"
              onClick={() => {
                void haptic();
                router.back();
              }}
              className="-ml-1 flex h-11 items-center gap-0.5 pr-2 text-[17px] text-primary active:opacity-60"
              data-testid="native-back"
            >
              <ChevronLeft className="size-7" strokeWidth={2.25} aria-hidden />
              {tNav('back')}
            </button>
          )}
        </div>
        <h1 className="truncate text-[17px] font-semibold text-foreground">
          {tab ? tNav(tab.labelKey) : ''}
        </h1>
        <div className="flex items-center justify-end gap-1">
          <WhatsNew variant="topbar" />
          <AccountMenu compact />
        </div>
      </div>
    </header>
  );
}
