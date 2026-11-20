import { authClient } from '@/lib/auth-client';
import { resetBootstrapCache } from './bootstrap';
import { setOfflineUser } from './offline/identity';
import { clearOfflineData } from './offline/sync';
import { wipePersistedQueries } from './query-cache';

async function purgeServiceWorkerRuntimeCaches(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    reg?.active?.postMessage({ type: 'PURGE_RUNTIME_CACHES' });
  } catch {
    // Best-effort cache cleanup
  }
}

export async function forgetLocalData(): Promise<void> {
  wipePersistedQueries();
  resetBootstrapCache();
  setOfflineUser(null);
  try {
    await Promise.allSettled([clearOfflineData(), purgeServiceWorkerRuntimeCaches()]);
  } catch {
    // A failed wipe must not keep the user signed in; the login page wipes again.
  }
}

export async function signOutAndForget() {
  await forgetLocalData();
  return authClient.signOut();
}
