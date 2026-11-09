'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

/** Error codes the API puts in `?error=` after a provider login; see api/src/lib/accounts.ts. */
const KEYS: Record<string, string> = {
  access_denied: 'errCancelled',
  account_not_linked: 'errNotLinked',
  invite_required: 'errInviteRequired',
  email_alias_taken: 'errEmailAlias',
  email_disposable: 'errEmailDisposable',
  // A session refused because the account has two-factor on.
  unable_to_create_session: 'errTwoFactor',
};

export function useOAuthErrorToast(): void {
  const t = useTranslations('auth.oauth');
  const code = useSearchParams().get('error');
  useEffect(() => {
    if (code) toast.error(t(KEYS[code] ?? 'errFailed'), { id: 'oauth-error' });
  }, [code, t]);
}
