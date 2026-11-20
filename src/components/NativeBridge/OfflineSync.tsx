'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { authClient } from '@/lib/auth-client';
import { setOfflineUser } from '@/lib/offline/identity';
import { syncOfflineWords } from '@/lib/offline/sync';
import { peekPendingShare } from '@/lib/share-import';

/** Where the bundled launcher lists the lessons kept for offline reading. */
const OFFLINE_LIST = 'capacitor://localhost/offline.html';

/** Sends words saved offline when the account is known and when the connection returns. */
export default function OfflineSync() {
  const t = useTranslations('chrome.offline');
  const { data: session, isPending } = authClient.useSession();
  const userId = session?.user?.id ?? null;
  const [offline, setOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    if (isPending) return;
    setOfflineUser(userId);
    if (!userId) return;
    // A link shared while signed out waits here until sign-in is done.
    if (peekPendingShare() && window.location.pathname !== '/share') {
      window.location.assign('/share');
      return;
    }
    const flush = async () => {
      const { rejected } = await syncOfflineWords(userId);
      if (rejected > 0) toast.warning(t('rejected', { count: rejected }));
    };
    const onOnline = () => {
      setOffline(false);
      void flush();
    };
    const onOffline = () => setOffline(true);
    void flush();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [isPending, userId, t]);

  if (!offline) return null;
  return (
    <div
      className="fixed inset-x-3 bottom-4 z-50 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2 text-sm shadow-lg"
      role="status"
      data-above-tabbar=""
      data-testid="offline-banner"
    >
      <span className="text-foreground">{t('banner')}</span>
      <a
        href={OFFLINE_LIST}
        className="inline-flex min-h-11 shrink-0 items-center px-2 font-semibold text-primary hover:underline active:opacity-60"
      >
        {t('openList')}
      </a>
    </div>
  );
}
