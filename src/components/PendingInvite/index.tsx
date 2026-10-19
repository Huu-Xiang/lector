'use client';

import { useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-base';
import { authClient } from '@/lib/auth-client';
import { invalidateEntitlementsCache } from '@/lib/data-layer';
import { planName } from '@/lib/plan-names';
import { PENDING_INVITE_KEY } from '@/lib/pending-invite';
import { useLectorMode } from '@/lib/use-env';

/** Redeems an admin code typed at sign-up once the account is signed in and verified. */
export default function PendingInvite() {
  const mode = useLectorMode();
  if (mode !== 'cloud') return null;
  return <CloudPendingInvite />;
}

function CloudPendingInvite() {
  const { data: session } = authClient.useSession();
  const t = useTranslations('settings.redeem');
  const locale = useLocale();
  const signedIn = !!session;

  useEffect(() => {
    if (!signedIn) return;
    let code: string | null = null;
    try {
      code = localStorage.getItem(PENDING_INVITE_KEY);
      if (code) localStorage.removeItem(PENDING_INVITE_KEY);
    } catch {
      return;
    }
    if (!code) return;
    void apiFetch('/api/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as { plan: string; endsAt: string };
        invalidateEntitlementsCache();
        toast.success(
          t('success', {
            plan: planName(body.plan),
            date: new Date(body.endsAt).toLocaleDateString(locale),
          }),
        );
      })
      .catch(() => {});
  }, [signedIn, t, locale]);

  return null;
}
