import { authClient } from '@/lib/auth-client';
import { clearOfflineData } from './offline/sync';
import { wipePersistedQueries } from './query-cache';

export async function forgetLocalData(): Promise<void> {
  wipePersistedQueries();
  try {
    await clearOfflineData();
  } catch {
    // A failed wipe must not keep the user signed in; the login page wipes again.
  }
}

export async function signOutAndForget() {
  await forgetLocalData();
  return authClient.signOut();
}
