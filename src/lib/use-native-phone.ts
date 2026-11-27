'use client';

import { useSyncExternalStore } from 'react';
import { useIsNativeApp } from '@/lib/native-app';
import { isIPadApp } from '@/components/NativeBridge/ipad-layout';

function subscribe(onChange: () => void) {
  const query = window.matchMedia('(width < 40rem)');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function snapshot() {
  return window.matchMedia('(width < 40rem)').matches;
}

export function useIsNativePhone() {
  const native = useIsNativeApp();
  const phone = useSyncExternalStore(subscribe, snapshot, () => false);
  return native && phone && !isIPadApp();
}
