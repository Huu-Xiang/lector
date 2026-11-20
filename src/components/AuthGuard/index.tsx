'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { bounceToLogin } from '@/lib/api-base';
import { fetchBootstrap, peekBootstrap, resetBootstrapCache } from '@/lib/bootstrap';
import { setActiveTenant, writeLanguageCache } from '@/lib/language-cache';
import { setOfflineUser } from '@/lib/offline/identity';
import { useLectorMode } from '@/lib/use-env';
import { authClient, isAuthRoute } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
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

  if (mode === 'selfhost') {
    return <SelfhostPassThrough>{children}</SelfhostPassThrough>;
  }

  return <CloudSessionGate>{children}</CloudSessionGate>;
}

function SelfhostPassThrough({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setOfflineUser('local');
  }, []);
  return <>{children}</>;
}

function CloudSessionGate({ children }: { children: React.ReactNode }) {
  const t = useTranslations('chrome.loading');
  const te = useTranslations('chrome.error');
  const pathname = usePathname();
  const onAuthRoute = isAuthRoute(pathname);
  const cached = peekBootstrap();
  const [userId, setUserId] = useState<string | null>(
    () => cached?.user?.id ?? (cached?.mode === 'cloud' ? 'local' : null),
  );
  const [resolved, setResolved] = useState<boolean>(() =>
    Boolean(cached && (cached.user?.id || cached.mode === 'cloud')),
  );
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Set during render so gated children read the right namespace from their first render.
  if (userId) setActiveTenant(userId);

  useEffect(() => {
    if (onAuthRoute || resolved) return;
    let cancelled = false;
    fetchBootstrap().then(async (result) => {
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
        setActiveTenant('local');
        if (result.data.targetLanguage) {
          writeLanguageCache(result.data.targetLanguage);
        }
        setUserId('local');
        setResolved(true);
        return;
      }
      if (!result.ok && result.status === 401) {
        bounceToLogin();
        return;
      }
      if (!result.ok && result.status === 404) {
        // Rolling-deploy fallback when browser leads an older API without /api/bootstrap.
        try {
          const session = await authClient.getSession();
          if (cancelled) return;
          const uid = session.data?.user?.id;
          if (uid) {
            setActiveTenant(uid);
            setOfflineUser(uid);
            setUserId(uid);
            setResolved(true);
            return;
          }
          if (!session.error) {
            bounceToLogin();
            return;
          }
        } catch {
          // fall through to retry UI
        }
      }
      if (!cancelled) setLoadError(true);
    });
    return () => {
      cancelled = true;
    };
  }, [onAuthRoute, resolved, attempt]);

  // Auth pages own their inverse redirect (session → /) and render regardless.
  if (onAuthRoute) return <>{children}</>;

  if (loadError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-sm text-muted-foreground">{te('body')}</p>
        <Button
          type="button"
          onClick={() => {
            resetBootstrapCache();
            setLoadError(false);
            setAttempt((n) => n + 1);
          }}
        >
          {te('retry')}
        </Button>
      </div>
    );
  }

  if (!resolved) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Spinner size="lg" label={t('session')} className="text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
