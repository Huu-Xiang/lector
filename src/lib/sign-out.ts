import { authClient } from '@/lib/auth-client';
import { clearOfflineData } from './offline/sync';
import { wipePersistedQueries } from './query-cache';

/** The one way to sign out: remembered content must not outlive the session. */
export async function signOutAndForget() {
  wipePersistedQueries();
  try {
    await clearOfflineData();
  } catch {
    // A failed wipe must not keep the user signed in; the login page wipes again.
  }
  return authClient.signOut();
}
