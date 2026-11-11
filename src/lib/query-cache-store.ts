import type { QueryKey, QueryMatch } from './query-cache';

const PREFIX = 'lector-qc:';
export const MAX_RECORD_AGE_MS = 14 * 24 * 60 * 60 * 1000;
/** Serialized characters; localStorage holds about 5 MB per origin. */
export const MAX_RECORD_CHARS = 1_000_000;

interface StoredRecord {
  k: QueryKey;
  s: number;
  v: unknown;
}

export interface QueryRecord {
  key: QueryKey;
  savedAt: number;
  value: unknown;
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : (window.localStorage ?? null);
  } catch {
    return null;
  }
}

function parse(raw: string | null): StoredRecord | null {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as StoredRecord;
  } catch {
    return null;
  }
}

function remove(store: Storage, storageKey: string): void {
  try {
    store.removeItem(storageKey);
  } catch {
    // A failing storage only means the record outlives this call.
  }
}

export function readRecord(id: string): QueryRecord | null {
  const store = storage();
  if (!store) return null;
  const storageKey = PREFIX + id;
  let record: StoredRecord | null;
  try {
    record = parse(store.getItem(storageKey));
  } catch {
    return null;
  }
  if (!record) return null;
  if (Date.now() - record.s > MAX_RECORD_AGE_MS) {
    remove(store, storageKey);
    return null;
  }
  return { key: record.k, savedAt: record.s, value: record.v };
}

export function writeRecord(id: string, key: QueryKey, value: unknown): void {
  const store = storage();
  if (!store) return;
  const storageKey = PREFIX + id;
  let raw: string;
  try {
    raw = JSON.stringify({ k: key, s: Date.now(), v: value } satisfies StoredRecord);
  } catch {
    remove(store, storageKey);
    return;
  }
  if (raw.length > MAX_RECORD_CHARS) {
    remove(store, storageKey);
    return;
  }
  try {
    store.setItem(storageKey, raw);
  } catch {
    remove(store, storageKey);
  }
}

function forEachRecord(visit: (storageKey: string, record: StoredRecord | null) => boolean): void {
  const store = storage();
  if (!store) return;
  const doomed: string[] = [];
  try {
    for (let i = 0; i < store.length; i += 1) {
      const storageKey = store.key(i);
      if (!storageKey?.startsWith(PREFIX)) continue;
      if (visit(storageKey, parse(store.getItem(storageKey)))) doomed.push(storageKey);
    }
  } catch {
    return;
  }
  for (const storageKey of doomed) remove(store, storageKey);
}

export function removeRecords(match: QueryMatch): void {
  forEachRecord((_, record) => {
    if (!record) return true;
    if (match.scope !== undefined && record.k.scope !== match.scope) return false;
    if (match.tenant !== undefined && record.k.tenant !== match.tenant) return false;
    if (match.language !== undefined && record.k.language !== match.language) return false;
    return true;
  });
}

export function dropOtherTenantRecords(tenant: string): void {
  forEachRecord((_, record) => !record || record.k.tenant !== tenant);
}

export function wipeRecords(): void {
  forEachRecord(() => true);
}
