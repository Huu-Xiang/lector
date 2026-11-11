/**
 * Read-through cache for API query helpers.
 *
 * Callers must supply an explicit tenant and, for language-scoped data, an
 * explicit language. A null key bypasses caching entirely; cloud reads before
 * session resolution therefore cannot create or consume a browser-global
 * entry. Values stay fresh in memory for 30 seconds, concurrent reads share
 * one promise, and invalidation also prevents an already-running request from
 * repopulating a key after a successful mutation.
 *
 * A `persist` read also keeps its value in localStorage, returns a remembered
 * value at once and refreshes it in the background, then announces a changed
 * value with `QUERY_UPDATED_EVENT`.
 */

import {
  dropOtherTenantRecords,
  readRecord,
  removeRecords,
  wipeRecords,
  writeRecord,
} from './query-cache-store';

export interface QueryKey {
  scope: string;
  tenant: string;
  language?: string;
  params?: readonly (boolean | null | number | string)[];
}

export type QueryMatch = Partial<Pick<QueryKey, 'scope' | 'tenant' | 'language'>>;

export interface QueryOptions {
  ttlMs?: number;
  persist?: boolean;
  /** Skip remembered values and wait for the network. */
  forceFresh?: boolean;
}

export const QUERY_UPDATED_EVENT = 'lector-query-updated';
export type QueryUpdatedDetail = Pick<QueryKey, 'scope' | 'tenant' | 'language'>;

interface QueryEntry {
  key: QueryKey;
  expiresAt: number;
  hasValue: boolean;
  value?: unknown;
  promise?: Promise<unknown>;
}

interface Remembered {
  has: boolean;
  value?: unknown;
}

interface Registration {
  key: QueryKey;
  loader: () => Promise<unknown>;
  ttlMs: number;
}

const DEFAULT_TTL_MS = 30_000;
const REFRESH_DELAY_MS = 5_000;
const NOTHING: Remembered = { has: false };
const entries = new Map<string, QueryEntry>();
const registrations = new Map<string, Registration>();
const pendingRefresh = new Set<string>();
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function serializeKey(key: QueryKey): string {
  return JSON.stringify([key.tenant, key.language ?? null, key.scope, key.params ?? []]);
}

function matches(key: QueryKey, match: QueryMatch): boolean {
  if (match.scope !== undefined && key.scope !== match.scope) return false;
  if (match.tenant !== undefined && key.tenant !== match.tenant) return false;
  if (match.language !== undefined && key.language !== match.language) return false;
  return true;
}

function remembered(serialized: string): Remembered {
  const entry = entries.get(serialized);
  if (entry?.hasValue) return { has: true, value: entry.value };
  const record = readRecord(serialized);
  return record ? { has: true, value: record.value } : NOTHING;
}

function sameValue(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function announce(key: QueryKey): void {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  const detail: QueryUpdatedDetail = {
    scope: key.scope,
    tenant: key.tenant,
    language: key.language,
  };
  window.dispatchEvent(new CustomEvent(QUERY_UPDATED_EVENT, { detail }));
}

/** The remembered value for a key, from memory or storage, without a request. */
export function peekQuery<T>(key: QueryKey | null): T | undefined {
  if (key === null) return undefined;
  const found = remembered(serializeKey(key));
  return found.has ? (found.value as T) : undefined;
}

function load<T>(
  serialized: string,
  key: QueryKey,
  loader: () => Promise<T>,
  ttlMs: number,
  persist: boolean,
  previous: Remembered,
): Promise<T> {
  const promise: Promise<T> = loader().then(
    (value) => {
      if (entries.get(serialized)?.promise === promise) {
        entries.set(serialized, {
          key,
          expiresAt: Date.now() + Math.max(0, ttlMs),
          hasValue: true,
          value,
        });
        if (persist) {
          writeRecord(serialized, key, value);
          if (previous.has && !sameValue(previous.value, value)) announce(key);
        }
      }
      return value;
    },
    (error: unknown) => {
      if (entries.get(serialized)?.promise === promise) {
        if (previous.has) {
          entries.set(serialized, { key, expiresAt: 0, hasValue: true, value: previous.value });
        } else {
          entries.delete(serialized);
        }
      }
      throw error;
    },
  );
  entries.set(serialized, {
    key,
    expiresAt: 0,
    hasValue: previous.has,
    value: previous.value,
    promise,
  });
  return promise;
}

export function cachedQuery<T>(
  key: QueryKey | null,
  loader: () => Promise<T>,
  options: number | QueryOptions = {},
): Promise<T> {
  const {
    ttlMs = DEFAULT_TTL_MS,
    persist = false,
    forceFresh = false,
  } = typeof options === 'number' ? { ttlMs: options } : options;
  if (key === null) return loader();

  const serialized = serializeKey(key);
  if (persist) registrations.set(serialized, { key, loader, ttlMs });
  const existing = entries.get(serialized);
  if (!forceFresh && existing?.hasValue && existing.expiresAt > Date.now()) {
    return Promise.resolve(existing.value as T);
  }

  const stale = persist && !forceFresh ? remembered(serialized) : NOTHING;
  if (existing?.promise) {
    return stale.has ? Promise.resolve(stale.value as T) : (existing.promise as Promise<T>);
  }

  const promise = load(serialized, key, loader, ttlMs, persist, stale);
  if (!stale.has) return promise;
  promise.catch(() => undefined);
  return Promise.resolve(stale.value as T);
}

function deferRefresh(): boolean {
  if (typeof document !== 'undefined' && document.hidden) return true;
  if (typeof window === 'undefined') return false;
  return window.location?.pathname?.startsWith('/read') ?? false;
}

function runRefresh(): void {
  refreshTimer = null;
  if (deferRefresh()) {
    refreshTimer = setTimeout(runRefresh, REFRESH_DELAY_MS);
    return;
  }
  const due = [...pendingRefresh];
  pendingRefresh.clear();
  for (const serialized of due) {
    const registration = registrations.get(serialized);
    if (!registration) continue;
    cachedQuery(registration.key, registration.loader, {
      ttlMs: registration.ttlMs,
      persist: true,
    }).catch(() => undefined);
  }
}

function scheduleRefresh(): void {
  if (refreshTimer !== null) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(runRefresh, REFRESH_DELAY_MS);
}

function dropMemory(match: QueryMatch): void {
  for (const [serialized, entry] of entries) {
    if (matches(entry.key, match)) entries.delete(serialized);
  }
}

/**
 * After a mutation: forget matching values in memory and storage, then
 * refresh the matching persisted keys once edits settle.
 */
export function invalidateQueries(match: QueryMatch): void {
  dropMemory(match);
  removeRecords(match);
  for (const [serialized, registration] of registrations) {
    if (matches(registration.key, match)) pendingRefresh.add(serialized);
  }
  if (pendingRefresh.size > 0) scheduleRefresh();
}

/** Memory only: a language switch must not erase remembered pages. */
export function clearTenantQueries(tenant: string): void {
  dropMemory({ tenant });
}

/** Memory only: runs on every cloud launch when the session user is set. */
export function clearQueryCache(): void {
  entries.clear();
  registrations.clear();
  pendingRefresh.clear();
  if (refreshTimer !== null) clearTimeout(refreshTimer);
  refreshTimer = null;
}

export function dropOtherUsersRecords(tenant: string): void {
  dropOtherTenantRecords(tenant);
}

/** Sign-out: forget every value in memory and on the device. */
export function wipePersistedQueries(): void {
  clearQueryCache();
  wipeRecords();
}
