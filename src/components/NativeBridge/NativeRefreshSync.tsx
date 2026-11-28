'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isBareRoute } from '@/lib/auth-client';
import { refreshActiveQueries } from '@/lib/data-layer';
import { endNativeRefreshing, onNativeRefresh, setNativeRefreshEnabled } from '@/lib/native-app';
import { hasOwnHeader } from './tab-bar';

export function nativeRefreshAllowed(pathname: string): boolean {
  return (
    !isBareRoute(pathname) &&
    !hasOwnHeader(pathname) &&
    (['/', '/stats', '/vocab', '/journal', '/me'].includes(pathname) ||
      pathname.startsWith('/collection/'))
  );
}

export default function NativeRefreshSync() {
  const pathname = usePathname();
  const router = useRouter();
  const enabled = nativeRefreshAllowed(pathname);
  useEffect(() => {
    void setNativeRefreshEnabled(enabled);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = onNativeRefresh(() => {
      if (!enabled) {
        void endNativeRefreshing();
        return;
      }
      clearTimeout(timer);
      const finish = () => {
        clearTimeout(timer);
        void endNativeRefreshing();
      };
      timer = setTimeout(finish, 1500);
      try {
        refreshActiveQueries();
        router.refresh();
      } finally {
        finish();
      }
    });
    return () => {
      stop();
      clearTimeout(timer);
      void endNativeRefreshing();
      void setNativeRefreshEnabled(false);
    };
  }, [enabled, router]);
  return null;
}
