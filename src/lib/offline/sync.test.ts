import { beforeEach, describe, expect, it } from 'vitest';
import type { Lesson } from '@/types';
import { setOfflineUser } from './identity';
import {
  clearOfflineData,
  readCachedLesson,
  rememberLesson,
  type OfflineStorageAdapter,
} from './sync';
import { readWebOfflineFile, writeWebOfflineFile } from './idb';

function memoryAdapter(): OfflineStorageAdapter {
  let raw: string | null = null;
  return {
    read: async () => raw,
    write: async (content) => {
      raw = content;
    },
  };
}

const sampleLesson = {
  id: 'lesson-1',
  title: 'Chapter 1',
  language: 'fr',
  textContent: 'Bonjour le monde.',
} as Lesson;

describe('offline sync & multi-tenant isolation', () => {
  beforeEach(() => {
    setOfflineUser(null);
  });

  it('caches and reads lessons strictly scoped by userId + lessonId', async () => {
    const adapter = memoryAdapter();
    setOfflineUser('user-a');
    await rememberLesson(sampleLesson, adapter);

    const mine = await readCachedLesson('lesson-1', adapter);
    expect(mine?.id).toBe('lesson-1');
    expect(mine?.userId).toBe('user-a');
    expect(mine?.text).toBe('Bonjour le monde.');

    // Switching active user must never return user-a's cached lesson
    setOfflineUser('user-b');
    expect(await readCachedLesson('lesson-1', adapter)).toBeNull();
  });

  it('supports synthetic local tenant for selfhost and clears all data on clearOfflineData', async () => {
    const adapter = memoryAdapter();
    setOfflineUser('local');
    await rememberLesson(sampleLesson, adapter);
    expect((await readCachedLesson('lesson-1', adapter))?.userId).toBe('local');

    await clearOfflineData(adapter);
    expect(await readCachedLesson('lesson-1', adapter)).toBeNull();
  });

  it('degrades gracefully when indexedDB is unavailable', async () => {
    expect(await readWebOfflineFile()).toBeNull();
    await expect(writeWebOfflineFile('{}')).resolves.toBeUndefined();
  });
});
