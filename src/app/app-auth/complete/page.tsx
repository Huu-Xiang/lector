'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export default function CompleteAppAuthPage() {
  return (
    <Suspense>
      <CompleteAuthentication />
    </Suspense>
  );
}

function CompleteAuthentication() {
  const t = useTranslations('auth.oauth');
  const params = useSearchParams();
  const challenge = params.get('challenge') ?? '';
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function finish() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch('/api/auth/native-auth/finish', {
        method: 'POST',
        body: '{}',
        headers: { 'Content-Type': 'application/json', 'x-readfox-auth-challenge': challenge },
      });
      if (!response.ok) throw new Error('Authentication unavailable');
      const { code } = await response.json();
      if (typeof code !== 'string' || !/^[a-f0-9]{64}$/.test(code)) throw new Error('Invalid code');
      window.location.replace(`readfox://auth-complete?code=${code}`);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[70svh] max-w-sm flex-col justify-center gap-4 px-6">
      <Button disabled={busy || !/^[a-f0-9]{64}$/.test(challenge)} onClick={() => void finish()}>
        {t('returnToApp')}
      </Button>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t('errFailed')}
        </p>
      )}
    </main>
  );
}
