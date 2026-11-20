'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { bounceToLogin } from '@/lib/api-base';
import { fetchBootstrap, peekBootstrap } from '@/lib/bootstrap';
import { setActiveTenant, writeLanguageCache } from '@/lib/language-cache';
import { useLectorMode } from '@/lib/use-env';
import { isAuthRoute } from '@/lib/auth-client';
import { Spinner } from '@/components/ui/spinner';

/**
 * Cloud-mode session gate (#218). Wraps SetupGuard in the root layout:
 * nothing app-shaped renders (and SetupGuard's settings probe never fires)
 * until a session exists, so an unauthenticated visitor lands on /login
 * instead of racing SetupGuard to /setup.
 *
 * Mode resolves via useLectorMode (hydration-safe — window.__ENV__ is
 * invisible to SSR and the first render must be identical on both sides, the
 * SetupGuard lesson). Selfhost passes through without ever mounting the
 * session hook — useSession fires a fetch on mount, and the auth-off API has
 * no /api/auth/* to answer it.
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const t = useTranslations('chrome.loading');
  const mode = useLectorMode();
  const pathname = usePathname();

  // Public pages need no session; rendering them during SSR puts their text in the HTML for crawlers.
  if (isAuthRoute(pathname)) return <>{children}</>;

  if (mode === 'unknown') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner size="lg" label={t('app')} className="text-primary" />
      </div>
    );
  }

  if (mode === 'selfhost') return <>{children}</>;

  return <CloudSessionGate>{children}</CloudSessionGate>;
}

function CloudSessionGate({ children }: { children: React.ReactNode }) {
  const t = useTranslations('chrome.loading');
  const pathname = usePathname();
  const onAuthRoute = isAuthRoute(pathname);
  const cached = peekBootstrap();
  const [userId, setUserId] = useState<string | null>(() => cached?.user?.id ?? null);
  const [resolved, setResolved] = useState<boolean>(() => Boolean(cached?.user?.id));

  // Set during render so gated children read the right namespace from their first render.
  if (userId) setActiveTenant(userId);

  useEffect(() => {
    if (onAuthRoute || resolved) return;
    let cancelled = false;
    fetchBootstrap().then((result) => {
      if (cancelled) return;
      if (result.ok && result.data.user?.id) {
        setActiveTenant(result.data.user.id);
        if (result.data.targetLanguage) {
          writeLanguageCache(result.data.targetLanguage);
        }
        setUserId(result.data.user.id);
        setResolved(true);
        return;
      }
      if (result.ok && result.data.mode === 'cloud' && !result.data.user) {
        // External-gate cloud mode (authRequired: false): pass through as local tenant.
        if (result.data.targetLanguage) {
          writeLanguageCache(result.data.targetLanguage);
        }
        setResolved(true);
        return;
      }
      if (!result.ok && result.status === 401) {
        // Shared idempotent hard redirect — a soft router.replace here races the
        // 401 bounce from apiFetch (outside-guard components fetch on mount) and
        // whichever navigation loses aborts (net::ERR_ABORTED).
        bounceToLogin();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [onAuthRoute, resolved]);

  // Auth pages own their inverse redirect (session → /) and render regardless.
  if (onAuthRoute) return <>{children}</>;

  if (!resolved) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner size="lg" label={t('session')} className="text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
