'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { claimBookFromSearch } from '@/lib/auth-return';
import { fetchBootstrap, peekBootstrap } from '@/lib/bootstrap';
import { getSetting } from '@/lib/data-layer';
import { readLanguageCache, writeLanguageCache } from '@/lib/language-cache';
import { isBareRoute } from '@/lib/auth-client';
import { Spinner } from '@/components/ui/spinner';
import TabPreloader from '@/components/TabPreloader';

/**
 * The first render must be identical on the server and the client, so we must not use any clientside APIs
 * that would cause mutations. This will result in a hydration error.
 */
export default function SetupGuard({ children }: { children: React.ReactNode }) {
  const t = useTranslations('chrome');
  const pathname = usePathname();
  const router = useRouter();

  const [checked, setChecked] = useState(pathname === '/setup' || isBareRoute(pathname));
  const [error, setError] = useState(false);

  useEffect(() => {
    if (checked || pathname === '/setup' || isBareRoute(pathname)) return;

    let cancelled = false;

    async function checkLanguage() {
      // Fast path: a cached language means setup is already done — skip the
      // network round-trip in the common case. The cache is keyed by tenant
      // (#281): this only ever sees the CURRENT user's value, so another
      // account's (or the pre-flip app's) browser leftovers can no longer
      // bypass setup. AuthGuard sits above us, so in cloud the session — and
      // with it the cache tenant — is resolved before this runs.
      if (readLanguageCache()) {
        setChecked(true);
        return;
      }

      const setupTarget = () => {
        if (pathname === '/claim-book' && typeof window !== 'undefined') {
          const claim = claimBookFromSearch(window.location.search);
          if (claim) {
            return `/setup?${new URLSearchParams({ book: claim.book, lang: claim.lang }).toString()}`;
          }
        }
        return '/setup';
      };

      const cachedBootstrap = peekBootstrap();
      if (cachedBootstrap) {
        if (cachedBootstrap.targetLanguage) {
          writeLanguageCache(cachedBootstrap.targetLanguage);
          setChecked(true);
          return;
        }
        if (!cancelled) router.replace(setupTarget());
        return;
      }

      try {
        const boot = await fetchBootstrap();
        if (cancelled) return;
        if (boot.ok) {
          if (boot.data.targetLanguage) {
            writeLanguageCache(boot.data.targetLanguage);
            setChecked(true);
            return;
          }
          router.replace(setupTarget());
          return;
        }

        // Fallback for rolling deploys where the browser leads the API.
        const serverLang = await getSetting<string>('targetLanguage');
        if (cancelled) return;
        if (serverLang) {
          writeLanguageCache(serverLang);
          setChecked(true);
          return;
        }
      } catch {
        if (cancelled) return;
        setError(true);
        return;
      }

      if (!cancelled) router.replace(setupTarget());
    }

    checkLanguage();
    return () => {
      cancelled = true;
    };
  }, [checked, pathname, router]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p className="text-sm text-muted-foreground">{t('setup.connectError')}</p>
        <Button
          onClick={() => {
            setError(false);
            setChecked(false);
          }}
        >
          {t('setup.retry')}
        </Button>
      </div>
    );
  }

  if (!checked && pathname !== '/setup' && !isBareRoute(pathname)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner size="lg" label={t('loading.setup')} className="text-primary" />
      </div>
    );
  }

  return (
    <>
      {children}
      {pathname !== '/setup' && !isBareRoute(pathname) && <TabPreloader />}
    </>
  );
}
