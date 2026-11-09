'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { BILLING_ROUTE } from '@/lib/api-base';
import { isAuthRoute } from '@/lib/auth-client';
import { syncBrowserTimeZone } from '@/lib/timezone-sync';

/** Mounted behind the session and billing guards; saves the browser's time zone once per load. */
export default function TimezoneSync() {
  const pathname = usePathname();
  const done = useRef(false);
  const skip = isAuthRoute(pathname) || pathname === BILLING_ROUTE;

  useEffect(() => {
    if (skip || done.current) return;
    done.current = true;
    void syncBrowserTimeZone();
  }, [skip]);

  return null;
}
