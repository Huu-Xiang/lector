import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_RECORD_CHARS,
  MAX_RECORD_AGE_MS,
  dropOtherTenantRecords,
  readRecord,
  removeRecords,
  wipeRecords,
  writeRecord,
} from './query-cache-store';
import type { QueryKey } from './query-cache';

type Stored = Map<string, string>;

function fakeStorage(stored: Stored, failWrites = false) {
  return {
    get length() {
      return stored.size;
    },
    key: (i: number) => [...stored.keys()][i] ?? null,
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (failWrites) throw new DOMException('full', 'QuotaExceededError');
      stored.set(k, v);
    },
    removeItem: (k: string) => void stored.delete(k),
  };
}

function useStorage(stored: Stored, failWrites = false) {
  (globalThis as unknown as { window?: unknown }).window = {
    localStorage: fakeStorage(stored, failWrites),
  };
}

const key = (tenant: string, scope = 'collections', language = 'en'): QueryKey => ({
  tenant,
  scope,
  language,
});
const id = (k: QueryKey) => JSON.stringify([k.tenant, k.language ?? null, k.scope, k.params ?? []]);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-11T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe('query cache records in localStorage', () => {
  it('round-trips a value with its key and save time', () => {
    const stored: Stored = new Map();
    useStorage(stored);
    writeRecord(id(key('a')), key('a'), [{ title: 'Walden' }]);

    expect(readRecord(id(key('a')))).toEqual({
      key: key('a'),
      savedAt: Date.now(),
      value: [{ title: 'Walden' }],
    });
  });

  it('ignores and removes a record older than the age limit', () => {
    const stored: Stored = new Map();
    useStorage(stored);
    writeRecord(id(key('a')), key('a'), 1);
    vi.advanceTimersByTime(MAX_RECORD_AGE_MS + 1);

    expect(readRecord(id(key('a')))).toBeNull();
    expect(stored.size).toBe(0);
  });

  it('does not store a value above the size cap and drops the older copy', () => {
    const stored: Stored = new Map();
    useStorage(stored);
    writeRecord(id(key('a')), key('a'), 'small');
    writeRecord(id(key('a')), key('a'), 'x'.repeat(MAX_RECORD_CHARS));

    expect(readRecord(id(key('a')))).toBeNull();
  });

  it('swallows a quota error and leaves nothing behind for that key', () => {
    const stored: Stored = new Map();
    useStorage(stored, true);

    expect(() => writeRecord(id(key('a')), key('a'), 1)).not.toThrow();
    expect(readRecord(id(key('a')))).toBeNull();
  });

  it('removes only the records that match scope, tenant and language', () => {
    const stored: Stored = new Map();
    useStorage(stored);
    writeRecord(id(key('a', 'collections')), key('a', 'collections'), 1);
    writeRecord(id(key('a', 'vocab')), key('a', 'vocab'), 2);
    writeRecord(id(key('b', 'collections')), key('b', 'collections'), 3);

    removeRecords({ tenant: 'a', scope: 'collections' });

    expect(readRecord(id(key('a', 'collections')))).toBeNull();
    expect(readRecord(id(key('a', 'vocab')))?.value).toBe(2);
    expect(readRecord(id(key('b', 'collections')))?.value).toBe(3);
  });

  it('drops every other user and keeps the active one', () => {
    const stored: Stored = new Map();
    useStorage(stored);
    writeRecord(id(key('a')), key('a'), 1);
    writeRecord(id(key('b')), key('b'), 2);
    stored.set('lector-target-language:a', 'en');

    dropOtherTenantRecords('a');

    expect(readRecord(id(key('a')))?.value).toBe(1);
    expect(readRecord(id(key('b')))).toBeNull();
    expect(stored.get('lector-target-language:a')).toBe('en');
  });

  it('wipes every record and nothing else', () => {
    const stored: Stored = new Map();
    useStorage(stored);
    writeRecord(id(key('a')), key('a'), 1);
    stored.set('lector-target-language:a', 'en');

    wipeRecords();

    expect(readRecord(id(key('a')))).toBeNull();
    expect(stored.get('lector-target-language:a')).toBe('en');
  });

  it('does nothing without a window', () => {
    expect(() => writeRecord(id(key('a')), key('a'), 1)).not.toThrow();
    expect(readRecord(id(key('a')))).toBeNull();
  });
});
