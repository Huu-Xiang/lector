'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { writePendingInvite } from '@/lib/pending-invite';
import { useOidcLogin, useOidcProviderName } from '@/lib/use-env';

/**
 * Starts the provider login (providerId 'oidc', fixed in api/src/lib/accounts.ts).
 * A cancelled or refused login returns to `errorPath`, where `useOAuthErrorToast` shows it.
 * `inviteCode` travels in the OAuth state; the API needs it only when invites are required.
 */
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
  if (!enabled) return null;

  async function start() {
    if (inviteCode) writePendingInvite(inviteCode);
    await authClient.signIn.oauth2({
      providerId: 'oidc',
      callbackURL: `${window.location.origin}${destination}`,
      errorCallbackURL: `${window.location.origin}${errorPath}`,
      additionalData: inviteCode ? { inviteCode } : undefined,
    });
  }

  return (
    <Button type="button" variant="outline" className="w-full" onClick={start} data-testid={testId}>
      {t('continue', { provider })}
    </Button>
  );
}
