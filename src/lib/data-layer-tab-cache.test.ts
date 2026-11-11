import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock('./api-base', () => ({ apiFetch }));
vi.mock('./language-cache', () => ({
  activeTenantId: () => 'local',
  readLanguageCache: () => 'en',
}));

import {
  createGroup,
  createJournalEntry,
  deleteJournalEntry,
  getAllCollections,
  getAllGroups,
  getAllVocab,
  getCollectionCounts,
  getJournalEntries,
  getReviewCounts,
  getReviewQueue,
  getSettingCached,
  peekAllCollections,
  peekAllVocab,
  peekSettingCached,
  setSetting,
  submitReviewAnswer,
  updateJournalDraft,
} from './data-layer';
import { getOnboardingSnapshotCached, peekOnboardingSnapshot } from './onboarding';
import { clearQueryCache, wipePersistedQueries } from './query-cache';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let stored: Map<string, string>;

beforeEach(() => {
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
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe('tab reads through the persisted cache', () => {
  it('getAllGroups makes one request within 30 s and a new one after createGroup', async () => {
    apiFetch
      .mockResolvedValueOnce(jsonResponse([{ id: 'g1' }]))
      .mockResolvedValueOnce(jsonResponse({ id: 'g2' }))
      .mockResolvedValueOnce(jsonResponse([{ id: 'g1' }, { id: 'g2' }]));

    await getAllGroups();
    await getAllGroups();
    expect(apiFetch).toHaveBeenCalledTimes(1);

    await createGroup('New');
    await expect(getAllGroups()).resolves.toEqual([{ id: 'g1' }, { id: 'g2' }]);
    expect(apiFetch).toHaveBeenCalledTimes(3);
  });

  it('journal create, update and delete each invalidate the journal list', async () => {
    const list = () => jsonResponse([{ id: 'e' }]);
    apiFetch.mockImplementation(async (path: string, init?: RequestInit) =>
      init?.method ? jsonResponse({ id: 'e' }) : list(),
    );

    await getJournalEntries(50);
    const reads = () => apiFetch.mock.calls.filter(([, init]) => !init?.method).length;

    await createJournalEntry('hallo');
    await getJournalEntries(50);
    expect(reads()).toBe(2);

    await updateJournalDraft('e', 'hallo!');
    await getJournalEntries(50);
    expect(reads()).toBe(3);

    await deleteJournalEntry('e');
    await getJournalEntries(50);
    expect(reads()).toBe(4);
  });

  it('a review answer refreshes the counts and the review queue always asks the API', async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/review/counts')) return jsonResponse({ due: 3 });
      if (path.startsWith('/api/review/queue')) return jsonResponse({ cards: [] });
      return jsonResponse({ ok: true });
    });

    await getReviewCounts();
    await getReviewQueue();
    await getReviewQueue();
    await submitReviewAnswer({
      roundId: 'r',
      eventId: 'e',
      cardId: 'c',
      rawAnswer: { kind: 'self', grade: 'good' } as never,
      questionType: 'recall' as never,
    });
    await getReviewCounts();

    const calls = apiFetch.mock.calls.map(([path]) => String(path));
    expect(calls.filter((p) => p.startsWith('/api/review/queue'))).toHaveLength(2);
    expect(calls.filter((p) => p.startsWith('/api/review/counts'))).toHaveLength(2);
  });

  it('vocab from a remembered record has real Date fields', async () => {
    apiFetch.mockResolvedValueOnce(
      jsonResponse([
        {
          id: 'v1',
          text: 'Haus',
          createdAt: '2026-11-01T00:00:00.000Z',
          stateUpdatedAt: '2026-11-02T00:00:00.000Z',
        },
      ]),
    );
    await getAllVocab();
    clearQueryCache();

    const [entry] = peekAllVocab() ?? [];
    expect(entry.createdAt).toBeInstanceOf(Date);
    expect(entry.stateUpdatedAt.toISOString()).toBe('2026-11-02T00:00:00.000Z');
  });

  it('the library resume card reads a remembered onboarding snapshot in a new session', async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse({ progress: { status: 'in_progress' } }));
    await getOnboardingSnapshotCached();
    clearQueryCache();

    expect(peekOnboardingSnapshot()).toEqual({ progress: { status: 'in_progress' } });
  });

  it('a synthetic 502 rejects, so the remembered collections stay in place', async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse([{ id: 'kept' }]));
    await getAllCollections();
    clearQueryCache();

    apiFetch.mockResolvedValueOnce(jsonResponse({ error: 'API unreachable' }, 502));
    await expect(getAllCollections()).resolves.toEqual([{ id: 'kept' }]);
    await Promise.resolve();
    await Promise.resolve();
    expect(peekAllCollections()).toEqual([{ id: 'kept' }]);
  });

  it('a synthetic 502 with nothing remembered rejects instead of returning the error body', async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse({ error: 'API unreachable' }, 502));
    await expect(getCollectionCounts()).rejects.toThrow('API unreachable');
  });

  it('setSetting invalidates the remembered setting', async () => {
    apiFetch
      .mockResolvedValueOnce(jsonResponse(['travel']))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse(['culture']));

    await getSettingCached('readingInterests');
    await setSetting('readingInterests', ['culture']);
    expect(peekSettingCached('readingInterests')).toBeUndefined();
    await expect(getSettingCached('readingInterests')).resolves.toEqual(['culture']);
  });

  it('a missing setting is remembered as undefined without an error', async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse({ error: 'not found' }, 404));
    await expect(getSettingCached('readingLevels')).resolves.toBeUndefined();
  });
});
