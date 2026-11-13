'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import {
  hasNativeAuthentication,
  openNativeAuthentication,
  useIsNativeApp,
} from '@/lib/native-app';
import { writePendingInvite } from '@/lib/pending-invite';
import { useOidcLogin, useOidcProviderName, useReadfoxBetaLogin } from '@/lib/use-env';

/** Starts the login with providerId 'oidc'; a refused login returns to `errorPath`. */
export default function OidcSignInButton({
  destination,
  errorPath,
  inviteCode,
  testId,
}: {
  destination: string;
  errorPath: '/login' | '/register';
  inviteCode?: string;
  testId: string;
}) {
  const t = useTranslations('auth.oauth');
  const enabled = useOidcLogin();
  const provider = useOidcProviderName();
  const inApp = useIsNativeApp();
  const betaLogin = useReadfoxBetaLogin();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const native =
    testId === 'login-oidc' &&
    inApp &&
    hasNativeAuthentication() &&
    (betaLogin || provider === 'Google');
  if (!enabled || (inApp && !native && !betaLogin)) return null;

  async function start() {
    if (native) {
      setBusy(true);
      setError(false);
      try {
        const hex = (bytes: Uint8Array) =>
          Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
        const verifier = hex(crypto.getRandomValues(new Uint8Array(32)));
        const challenge = hex(
          new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))),
        );
        const url = new URL('/app-auth', window.location.origin);
        url.searchParams.set('challenge', challenge);
        const code = await openNativeAuthentication(url.href);
        if (!code) return;
        const response = await fetch('/api/auth/native-auth/redeem', {
          method: 'POST',
          body: '{}',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'x-readfox-auth-code': code,
            'x-readfox-auth-verifier': verifier,
          },
        });
        if (!response.ok) throw new Error('Could not complete sign-in');
        window.location.replace(destination);
      } catch {
        setError(true);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (inviteCode) writePendingInvite(inviteCode);
    await authClient.signIn.oauth2({
      providerId: 'oidc',
      callbackURL: `${window.location.origin}${destination}`,
      errorCallbackURL: `${window.location.origin}${errorPath}`,
      additionalData: inviteCode ? { inviteCode } : undefined,
    });
  }

  const label = native ? 'Google' : provider;
  return (
    <>
      <Button
        disabled={busy}
        aria-busy={busy}
        type="button"
        variant="outline"
        className="w-full"
        onClick={start}
        data-testid={testId}
      >
        {label === 'Google' && <GoogleMark />}
        {t('continue', { provider: label })}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t('errFailed')}
        </p>
      )}
    </>
  );
}

/** Google's standard four-colour "G", which its branding rules ask for on sign-in buttons. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" data-testid="google-mark">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
