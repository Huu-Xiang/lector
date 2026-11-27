'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useIsNativePhone } from './use-native-phone';

let registration: { action: () => void } | null = null;
const listeners = new Set<() => void>();

export function registerNativeDrillExit(action: () => void) {
  const current = { action };
  registration = current;
  listeners.forEach((listener) => listener());
  return () => {
    if (registration !== current) return;
    registration = null;
    listeners.forEach((listener) => listener());
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function nativeDrillExit() {
  return registration?.action ?? null;
}

export function useNativeDrillAction() {
  return useSyncExternalStore(subscribe, nativeDrillExit, () => null);
}

export function useNativeDrillExit(action: () => void, active = true) {
  const phone = useIsNativePhone();
  useEffect(() => {
    if (!phone || !active) return;
    return registerNativeDrillExit(action);
  }, [action, active, phone]);
}
