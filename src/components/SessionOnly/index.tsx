'use client';

import { usePathname } from 'next/navigation';
import { authClient, isBareRoute } from '@/lib/auth-client';
import { useLectorMode } from '@/lib/use-env';

/**
 * Renders app chrome only once a session exists (cloud) or the mode is known to need none
 * (selfhost). Chrome outside AuthGuard fetches on mount, so it must not mount earlier.
 */
export default function SessionOnly({ children }: { children: React.ReactNode }) {
  const mode = useLectorMode();
  const pathname = usePathname();
  if (mode === 'unknown' || isBareRoute(pathname)) return null;
  if (mode === 'selfhost') return <>{children}</>;
  return <CloudSessionOnly>{children}</CloudSessionOnly>;
}

function CloudSessionOnly({ children }: { children: React.ReactNode }) {
  const { data: session } = authClient.useSession();
  return session ? <>{children}</> : null;
}
