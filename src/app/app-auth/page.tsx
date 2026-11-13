'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { authClient } from '@/lib/auth-client';
import { Spinner } from '@/components/ui/spinner';

export default function AppAuthPage() {
  return (
    <Suspense>
      <StartAuthentication />
    </Suspense>
  );
}

function StartAuthentication() {
  const params = useSearchParams();
  const t = useTranslations('auth');
  const challenge = params.get('challenge') ?? '';
  const cancelled = params.has('error');
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (cancelled) return;
    if (started.current || !/^[a-f0-9]{64}$/.test(challenge)) return;
    started.current = true;
    const origin = window.location.origin;
    void authClient.signIn
      .oauth2({
        providerId: 'oidc',
        callbackURL: `${origin}/app-auth/complete?challenge=${challenge}`,
        errorCallbackURL: `${origin}/app-auth?error=sign-in`,
      })
      .then(({ error }) => {
        if (error) setFailed(true);
      })
      .catch(() => setFailed(true));
  }, [challenge, cancelled]);

  return (
    <main className="grid min-h-[70svh] place-items-center px-6">
      {failed || cancelled || !/^[a-f0-9]{64}$/.test(challenge) ? (
        <p role="alert">{t('oauth.errFailed')}</p>
      ) : (
        <Spinner label={t('loadingAuth')} />
      )}
    </main>
  );
}
