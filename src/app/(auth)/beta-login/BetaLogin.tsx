'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { authClient } from '@/lib/auth-client';
import { apiFetch } from '@/lib/api-base';
import { authHref, readfoxBetaLoginPath } from '@/lib/auth-return';

export default function BetaLogin() {
  const t = useTranslations('auth.login');
  const params = useSearchParams();
  const query = params.toString();
  const destination = readfoxBetaLoginPath(query);
  const { data: session, error, isPending } = authClient.useSession();
  const [failed, setFailed] = useState(false);
  const submitted = useRef<string | null>(null);

  useEffect(() => {
    if (!destination || isPending || error) return;
    if (!session) {
      window.location.replace(authHref('/login', destination));
      return;
    }
    if (submitted.current === query) return;
    submitted.current = query;
    void (async () => {
      try {
        const response = await apiFetch('/api/auth/oauth2/continue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ selected: true, oauth_query: query }),
        });
        if (!response.ok) throw new Error();
        const { url } = (await response.json()) as { url?: string };
        if (!url) throw new Error();
        const next = new URL(url);
        const callback = new URL(new URLSearchParams(query).get('redirect_uri') ?? '');
        if (next.origin !== callback.origin || next.pathname !== callback.pathname)
          throw new Error();
        window.location.replace(next.href);
      } catch {
        setFailed(true);
      }
    })();
  }, [destination, error, isPending, query, session]);

  if (failed || error || !destination) return <p role="alert">{t('errFailed')}</p>;
  return <p role="status">{t('submitting')}</p>;
}
