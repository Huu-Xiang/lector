'use client';

import { useEffect } from 'react';
import { isNativeApp } from '@/lib/native-app';

/** Sends the iPhone app away from a page that sells or promotes a plan. Renders nothing. */
export default function NativeAppRedirect({ to }: { to: string }) {
  useEffect(() => {
    if (isNativeApp()) window.location.replace(to);
  }, [to]);
  return null;
}
