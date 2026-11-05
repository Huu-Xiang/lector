'use client';

import { useIsNativeApp } from '@/lib/native-app';

/** Renders its children everywhere except inside the iPhone app. */
export default function HideInNativeApp({ children }: { children: React.ReactNode }) {
  return useIsNativeApp() ? null : <>{children}</>;
}
