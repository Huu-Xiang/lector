'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useLectorMode } from '@/lib/use-env';
import { useIsNativeApp } from '@/lib/native-app';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { authHref } from '@/lib/auth-return';
import Image from 'next/image';
import { Spinner } from '@/components/ui/spinner';
import LegalLinks from '@/components/LegalLinks';
import BackButton from '@/components/LegalLinks/BackButton';
import NativeAppRedirect from '@/components/NativeAppRedirect';

/**
 * Shared shell for the pre-session pages (#218): /login, /register,
 * /reset-password. Full-screen centered card, no app chrome — NavHeader
 * hides itself on these routes and AuthGuard/SetupGuard pass them through.
 *
 * Accounts exist only in cloud mode, so this is also the selfhost gate: the
 * pages never mount there (their session hooks would probe an endpoint the
 * auth-off API doesn't serve) — selfhost visitors bounce straight home.
 * Mode resolves via useLectorMode (window.__ENV__ is invisible to SSR); the
 * first render is the same spinner on both sides.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const t = useTranslations('common');
  const tAuth = useTranslations('auth');
  const mode = useLectorMode();
  const native = useIsNativeApp();
  const tLegal = useTranslations('legal');
  const pathname = usePathname();
  const wide = pathname === '/subscribe';
  const width = wide ? 'max-w-6xl' : pathname === '/register' ? 'max-w-2xl' : 'max-w-sm';

  useEffect(() => {
    if (mode === 'selfhost') router.replace('/');
  }, [mode, router]);

  if (pathname === '/welcome' && mode === 'cloud') return children;

  if (native && !wide && mode === 'cloud') {
    return (
      <main className="mx-auto w-full max-w-sm px-5 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Link
          href="/welcome"
          onClick={(event) => {
            event.preventDefault();
            router.push(
              authHref('/welcome', new URLSearchParams(window.location.search).get('next')),
            );
          }}
          className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
        >
          <ArrowLeft size={16} aria-hidden="true" /> {tLegal('back')}
        </Link>
        {children}
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10 md:py-6">
      {wide && <NativeAppRedirect to="/" />}
      <div className={`mb-4 w-full md:mb-2 ${width}`}>
        <BackButton />
      </div>
      <div className="mb-8 text-center md:mb-4 md:flex md:items-center md:justify-center md:gap-3 md:text-left">
        <Image
          src="/logo.png"
          alt=""
          width={64}
          height={64}
          priority
          className="mx-auto mb-3 rounded-xl md:mx-0 md:mb-0 md:size-12"
        />
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-xl">
            {t('appName')}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground md:mt-0">{t('tagline')}</p>
        </div>
      </div>
      <div className={`w-full ${width} rounded-2xl border border-border bg-card p-6 shadow-sm`}>
        {mode === 'cloud' ? (
          children
        ) : (
          <div className="flex justify-center py-8" data-testid="auth-mode-pending">
            <Spinner size="lg" label={tAuth('loadingAuth')} className="text-primary" />
          </div>
        )}
      </div>
      <LegalLinks className="mt-6 md:mt-3" />
    </div>
  );
}
