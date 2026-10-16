import { getLibraryCatalog, type LibraryBook } from './data-layer';
import { readPersisted, writePersisted } from './persisted-cache';

const KEY = 'readfox-library-catalog-v1';
const memory = new Map<string, LibraryBook[]>();

/** The last catalog seen, for an instant first paint while a fresh one loads. */
export function cachedCatalog(language: string): LibraryBook[] | null {
  const hit = memory.get(language);
  if (hit) return hit;
  const stored = readPersisted<LibraryBook[]>(`${KEY}-${language}`);
  if (stored) memory.set(language, stored);
  return stored;
}

export async function loadCatalog(language: string): Promise<LibraryBook[]> {
  const books = await getLibraryCatalog(language);
  memory.set(language, books);
  writePersisted(`${KEY}-${language}`, books);
  return books;
}
