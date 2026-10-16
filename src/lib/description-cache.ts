import type { ArticleDescription } from './data-layer';
import { readPersisted, writePersisted } from './persisted-cache';

const STORE = 'readfox-article-descriptions-v1';
const MAX_STORED = 400;

const memory = new Map<string, Record<string, ArticleDescription>>();

function table(native: string): Record<string, ArticleDescription> {
  let found = memory.get(native);
  if (!found) {
    found = readPersisted<Record<string, ArticleDescription>>(`${STORE}-${native}`) ?? {};
    memory.set(native, found);
  }
  return found;
}

export function knownDescriptions(
  native: string,
  ids: readonly string[],
): Record<string, ArticleDescription> {
  const all = table(native);
  return Object.fromEntries(ids.flatMap((id) => (all[id] ? [[id, all[id]]] : [])));
}

/** Keeps the newest MAX_STORED entries of a native language. */
export function rememberDescriptions(
  native: string,
  got: Record<string, ArticleDescription>,
): void {
  const merged = { ...table(native), ...got };
  const keys = Object.keys(merged);
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_STORED))) delete merged[key];
  memory.set(native, merged);
  writePersisted(`${STORE}-${native}`, merged);
}

export function resetDescriptionMemory(): void {
  memory.clear();
}
