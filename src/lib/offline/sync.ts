import { isNativeApp, readNativeFile, writeNativeFile } from '@/lib/native-app';
import type { Lesson } from '@/types';
import { readWebOfflineFile, writeWebOfflineFile } from './idb';
import { getOfflineUser, waitForOfflineUser } from './identity';
import {
  OFFLINE_FILE,
  cacheLesson,
  dropLesson,
  emptyOfflineState,
  flushQueue,
  forgetOtherUsers,
  parseOfflineState,
  type OfflineLesson,
  type OfflineState,
} from './store';

export interface OfflineStorageAdapter {
  read: () => Promise<string | null>;
  write: (content: string) => Promise<void>;
}

function defaultAdapter(): OfflineStorageAdapter {
  if (isNativeApp()) {
    return {
      read: () => readNativeFile(OFFLINE_FILE),
      write: (content) => writeNativeFile(OFFLINE_FILE, content),
    };
  }
  return {
    read: readWebOfflineFile,
    write: writeWebOfflineFile,
  };
}

// One chain, so two updates never read the same store and overwrite each other.
let chain: Promise<unknown> = Promise.resolve();

function update<T>(
  change: (state: OfflineState) => Promise<{ state: OfflineState; result: T }>,
  adapter: OfflineStorageAdapter = defaultAdapter(),
) {
  const run = chain.then(async () => {
    const state = parseOfflineState(await adapter.read());
    const next = await change(state);
    await adapter.write(JSON.stringify(next.state));
    return next.result;
  });
  chain = run.catch(() => undefined);
  return run;
}

/** Remembers a lesson the user just opened, so it can be read with no connection. */
export async function rememberLesson(
  lesson: Lesson,
  adapter?: OfflineStorageAdapter,
): Promise<void> {
  const userId = await waitForOfflineUser(3000);
  if (!userId) return;
  await update(
    async (state) => ({
      state: cacheLesson(state, {
        userId,
        id: lesson.id,
        title: lesson.title,
        language: lesson.language ?? 'en',
        text: lesson.textContent,
        openedAt: new Date().toISOString(),
      }),
      result: undefined,
    }),
    adapter,
  );
}

/**
 * Reads a cached lesson strictly scoped to the active tenant (`userId + lessonId`).
 * Never returns another account's cached lesson.
 */
export async function readCachedLesson(
  lessonId: string,
  adapter: OfflineStorageAdapter = defaultAdapter(),
): Promise<OfflineLesson | null> {
  const userId = getOfflineUser();
  if (!userId) return null;
  const state = parseOfflineState(await adapter.read());
  return state.lessons.find((l) => l.userId === userId && l.id === lessonId) ?? null;
}

/** Drops a lesson the server no longer has. */
export async function forgetLesson(
  lessonId: string,
  adapter?: OfflineStorageAdapter,
): Promise<void> {
  const userId = getOfflineUser();
  if (!userId) return;
  await update(
    async (state) => ({
      state: dropLesson(state, userId, lessonId),
      result: undefined,
    }),
    adapter,
  );
}

/** Removes everything the app keeps for offline reading. Called on sign-out and deletion. */
export async function clearOfflineData(adapter?: OfflineStorageAdapter): Promise<void> {
  await update(async () => ({ state: emptyOfflineState(), result: undefined }), adapter);
}

/** Drops data of other accounts, then sends this account's queued words. */
export async function syncOfflineWords(
  userId: string,
  adapter?: OfflineStorageAdapter,
): Promise<{ saved: number; rejected: number }> {
  const { postQueuedVocab } = await import('@/lib/data-layer');
  return update(async (state) => {
    const mine = forgetOtherUsers(state, userId);
    const out = await flushQueue(mine, userId, (word) => postQueuedVocab(word));
    return { state: out.state, result: { saved: out.saved, rejected: out.rejected } };
  }, adapter);
}
