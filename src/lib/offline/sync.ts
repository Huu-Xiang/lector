import { isNativeApp, readNativeFile, writeNativeFile } from '@/lib/native-app';
import type { Lesson } from '@/types';
import { getOfflineUser, waitForOfflineUser } from './identity';
import {
  OFFLINE_FILE,
  cacheLesson,
  dropLesson,
  emptyOfflineState,
  flushQueue,
  forgetOtherUsers,
  parseOfflineState,
  type OfflineState,
} from './store';

// One chain, so two updates never read the same file and overwrite each other.
let chain: Promise<unknown> = Promise.resolve();

function update<T>(change: (state: OfflineState) => Promise<{ state: OfflineState; result: T }>) {
  const run = chain.then(async () => {
    const state = parseOfflineState(await readNativeFile(OFFLINE_FILE));
    const next = await change(state);
    await writeNativeFile(OFFLINE_FILE, JSON.stringify(next.state));
    return next.result;
  });
  chain = run.catch(() => undefined);
  return run;
}

/** Remembers a lesson the user just opened, so it can be read with no connection. */
export async function rememberLesson(lesson: Lesson): Promise<void> {
  if (!isNativeApp()) return;
  const userId = await waitForOfflineUser(3000);
  if (!userId) return;
  await update(async (state) => ({
    state: cacheLesson(state, {
      userId,
      id: lesson.id,
      title: lesson.title,
      language: lesson.language ?? 'en',
      text: lesson.textContent,
      openedAt: new Date().toISOString(),
    }),
    result: undefined,
  }));
}

/** Drops a lesson the server no longer has. */
export async function forgetLesson(lessonId: string): Promise<void> {
  const userId = getOfflineUser();
  if (!isNativeApp() || !userId) return;
  await update(async (state) => ({
    state: dropLesson(state, userId, lessonId),
    result: undefined,
  }));
}

/** Removes everything the app keeps for offline reading. Called on sign-out and deletion. */
export async function clearOfflineData(): Promise<void> {
  if (!isNativeApp()) return;
  await update(async () => ({ state: emptyOfflineState(), result: undefined }));
}

/** Drops data of other accounts, then sends this account's queued words. */
export async function syncOfflineWords(
  userId: string,
): Promise<{ saved: number; rejected: number }> {
  if (!isNativeApp()) return { saved: 0, rejected: 0 };
  const { postQueuedVocab } = await import('@/lib/data-layer');
  return update(async (state) => {
    const mine = forgetOtherUsers(state, userId);
    const out = await flushQueue(mine, userId, (word) => postQueuedVocab(word));
    return { state: out.state, result: { saved: out.saved, rejected: out.rejected } };
  });
}
