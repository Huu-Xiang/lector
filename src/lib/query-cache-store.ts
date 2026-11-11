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

const parsed = new Map<string, { raw: string; record: StoredRecord }>();

export function matches(key: QueryKey, match: QueryMatch): boolean {
  if (match.scope !== undefined && key.scope !== match.scope) return false;
  if (match.tenant !== undefined && key.tenant !== match.tenant) return false;
  if (match.language !== undefined && key.language !== match.language) return false;
  return true;
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : (window.localStorage ?? null);
  } catch {
    return null;
  }
}

function parse(storageKey: string, raw: string | null): StoredRecord | null {
  if (raw === null) return null;
  const memo = parsed.get(storageKey);
  if (memo?.raw === raw) return memo.record;
  try {
    const record = JSON.parse(raw) as StoredRecord;
    parsed.set(storageKey, { raw, record });
    return record;
  } catch {
    return null;
  }
}

/** The storage key holds the serialized query key, so matching never parses a value. */
function keyOf(storageKey: string): QueryKey | null {
  try {
    const [tenant, language, scope, params] = JSON.parse(storageKey.slice(PREFIX.length)) as [
      string,
      string | null,
      string,
      QueryKey['params'],
    ];
    return { tenant, language: language ?? undefined, scope, params };
  } catch {
    return null;
  }
}

function removeBestEffort(store: Storage, storageKey: string): void {
  parsed.delete(storageKey);
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
    record = parse(storageKey, store.getItem(storageKey));
  } catch {
    return null;
  }
  if (!record) return null;
  if (Date.now() - record.s > MAX_RECORD_AGE_MS) {
    removeBestEffort(store, storageKey);
    return null;
  }
  return { key: record.k, savedAt: record.s, value: record.v };
}

export function hasRecord(id: string): boolean {
  try {
    return storage()?.getItem(PREFIX + id) != null;
  } catch {
    return false;
  }
}

export function writeRecord(id: string, key: QueryKey, value: unknown): void {
  const store = storage();
  if (!store) return;
  const storageKey = PREFIX + id;
  let raw: string;
  try {
    raw = JSON.stringify({ k: key, s: Date.now(), v: value } satisfies StoredRecord);
  } catch {
    removeBestEffort(store, storageKey);
    return;
  }
  if (raw.length > MAX_RECORD_CHARS) {
    removeBestEffort(store, storageKey);
    return;
  }
  try {
    store.setItem(storageKey, raw);
  } catch {
    removeBestEffort(store, storageKey);
  }
}

function forEachRecord(visit: (storageKey: string, key: QueryKey | null) => boolean): void {
  const store = storage();
  if (!store) return;
  const doomed: string[] = [];
  try {
    for (let i = 0; i < store.length; i += 1) {
      const storageKey = store.key(i);
      if (!storageKey?.startsWith(PREFIX)) continue;
      if (visit(storageKey, keyOf(storageKey))) doomed.push(storageKey);
    }
  } catch {
    return;
  }
  for (const storageKey of doomed) removeBestEffort(store, storageKey);
}

export function removeRecords(match: QueryMatch): void {
  forEachRecord((_, key) => !key || matches(key, match));
}

export function keepNewestRecords(match: QueryMatch, head: string, keep: number): void {
  const store = storage();
  if (!store) return;
  const found: { storageKey: string; savedAt: number }[] = [];
  forEachRecord((storageKey, key) => {
    if (!key || key.params?.[0] !== head || !matches(key, match)) return false;
    const record = parse(storageKey, store.getItem(storageKey));
    found.push({ storageKey, savedAt: record?.s ?? 0 });
    return false;
  });
  found.sort((a, b) => b.savedAt - a.savedAt);
  for (const { storageKey } of found.slice(keep)) removeBestEffort(store, storageKey);
}

export function dropOtherTenantRecords(tenant: string): void {
  forEachRecord((_, key) => !key || key.tenant !== tenant);
}

export function wipeRecords(): void {
  forEachRecord(() => true);
}
