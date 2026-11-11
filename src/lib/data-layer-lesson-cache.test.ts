import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock('./api-base', () => ({ apiFetch }));
vi.mock('./language-cache', () => ({
  activeTenantId: () => 'local',
  readLanguageCache: () => 'en',
}));

import {
  deleteLesson,
  getAllCollections,
  getKnownWordsMap,
  getLesson,
  getLessonsForCollection,
  incrementDailyStat,
  peekAllCollections,
  peekKnownWordsMap,
  peekLesson,
  saveVocab,
  updateLessonProgress,
  updateVocabState,
} from './data-layer';
import type { VocabEntry } from '@/types';
import { clearQueryCache, wipePersistedQueries } from './query-cache';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let stored: Map<string, string>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-11T00:00:00Z'));
  apiFetch.mockReset();
  stored = new Map();
  (globalThis as unknown as { window?: unknown }).window = {
    localStorage: {
      get length() {
        return stored.size;
      },
      key: (i: number) => [...stored.keys()][i] ?? null,
      getItem: (k: string) => stored.get(k) ?? null,
      setItem: (k: string, v: string) => void stored.set(k, v),
      removeItem: (k: string) => void stored.delete(k),
    },
    location: { pathname: '/' },
    dispatchEvent: () => true,
  };
  wipePersistedQueries();
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as unknown as { window?: unknown }).window;
});

const lesson = (id: string) => ({ id, title: `Lesson ${id}`, textContent: `Text ${id}` });

describe('recently read lessons', () => {
  it('opening a sixth lesson evicts the oldest from storage', async () => {
    apiFetch.mockImplementation(async (path: string) =>
      jsonResponse(lesson(path.split('/').pop()!)),
    );
    for (const id of ['1', '2', '3', '4', '5', '6']) {
      await getLesson(id);
      vi.advanceTimersByTime(1000);
    }
    clearQueryCache();

    expect(peekLesson('1')).toBeUndefined();
    for (const id of ['2', '3', '4', '5', '6'])
      expect(peekLesson(id)?.textContent).toBe(`Text ${id}`);
  });

  it('a remembered lesson opens from storage after a restart, even if the network fails', async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse(lesson('a')));
    await getLesson('a');
    clearQueryCache();

    apiFetch.mockResolvedValueOnce(jsonResponse({ error: 'API unreachable' }, 502));
    await expect(getLesson('a')).resolves.toMatchObject({ textContent: 'Text a' });
    await vi.runAllTimersAsync();
    expect(peekLesson('a')?.textContent).toBe('Text a');
  });

  it('a lesson deleted on the server comes back as not found', async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse({ error: 'not found' }, 404));
    await expect(getLesson('gone')).resolves.toBeUndefined();
  });

  it('deleteLesson makes the chapter list ask the server again', async () => {
    apiFetch
      .mockResolvedValueOnce(jsonResponse([{ id: '1' }, { id: '2' }]))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse([{ id: '2' }]));

    await getLessonsForCollection('c');
    await deleteLesson('1');
    await expect(getLessonsForCollection('c')).resolves.toEqual([{ id: '2' }]);
  });

  it('a fresh read always calls the API, as the transcription poll needs', async () => {
    apiFetch.mockImplementation(async () => jsonResponse(lesson('t')));
    await getLesson('t');
    await getLesson('t', { fresh: true });
    await getLesson('t', { fresh: true });
    expect(apiFetch).toHaveBeenCalledTimes(3);
  });

  it('saves made while reading keep the remembered library, lesson and word states', async () => {
    apiFetch
      .mockResolvedValueOnce(jsonResponse(lesson('a')))
      .mockResolvedValueOnce(jsonResponse([{ id: 'c', title: 'Book' }]))
      .mockResolvedValueOnce(jsonResponse({ haus: 'known' }))
      .mockResolvedValue(jsonResponse({ ok: true, id: 'v1' }));
    await getLesson('a');
    await getAllCollections();
    await getKnownWordsMap();

    await updateLessonProgress('a', { scrollPosition: 640, percentComplete: 40 });
    await saveVocab({ text: 'baum' } as unknown as VocabEntry);
    await updateVocabState('v1', 'known');
    await incrementDailyStat('dictionaryLookups');
    clearQueryCache();

    expect(peekLesson('a')).toMatchObject({
      textContent: 'Text a',
      progress_scrollPosition: 640,
      progress_percentComplete: 40,
    });
    expect(peekAllCollections()).toEqual([{ id: 'c', title: 'Book' }]);
    expect(peekKnownWordsMap()?.get('haus')).toBe('known');
  });

  it('the known-words map survives a restart with its entries', async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse({ haus: 'known', baum: 'level2' }));
    await getKnownWordsMap();
    clearQueryCache();

    const map = peekKnownWordsMap();
    expect(map).toBeInstanceOf(Map);
    expect(map?.get('haus')).toBe('known');
    expect(map?.get('baum')).toBe('level2');
  });
});
