'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { authClient } from '@/lib/auth-client';
import { setOfflineUser } from '@/lib/offline/identity';
import { syncOfflineWords } from '@/lib/offline/sync';

/** Where the bundled launcher lists the lessons kept for offline reading. */
const OFFLINE_LIST = 'capacitor://localhost/offline.html';

/** Sends words saved offline when the account is known and when the connection returns. */
export default function OfflineSync() {
  const t = useTranslations('chrome.offline');
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? null;
  const [offline, setOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    setOfflineUser(userId);
    if (!userId) return;
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
  }, [userId, t]);

  if (!offline) return null;
  return (
    <div
      className="fixed inset-x-3 bottom-24 z-50 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-lg"
      role="status"
      data-testid="offline-banner"
    >
      <span className="text-foreground">{t('banner')}</span>
      <a href={OFFLINE_LIST} className="font-semibold text-primary hover:underline">
        {t('openList')}
      </a>
    </div>
  );
}
