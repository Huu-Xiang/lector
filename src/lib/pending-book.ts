import { LANGUAGES } from './languages';

export const PENDING_BOOK_KEY = 'readfox-pending-book';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface BookRef {
  language: string;
  slug: string;
}

const REF_PATTERN = /^([a-z]{2,3})\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/** Parses `<language>/<slug>`, the form the `book` query parameter and the store use. */
export function parseBookRef(value: string | null | undefined): BookRef | null {
  const match = value ? REF_PATTERN.exec(value) : null;
  if (!match || !(match[1] in LANGUAGES)) return null;
  return { language: match[1], slug: match[2] };
}

export function registerHrefForBook(ref: BookRef): string {
  return `/register?book=${encodeURIComponent(`${ref.language}/${ref.slug}`)}`;
}

export function readPendingBook(now = Date.now()): BookRef | null {
  try {
    const stored = JSON.parse(localStorage.getItem(PENDING_BOOK_KEY) ?? 'null') as {
      ref?: unknown;
      savedAt?: unknown;
    } | null;
    if (!stored || typeof stored.ref !== 'string' || typeof stored.savedAt !== 'number') {
      return null;
    }
    return now - stored.savedAt <= MAX_AGE_MS ? parseBookRef(stored.ref) : null;
  } catch {
    return null;
  }
}

export function writePendingBook(ref: BookRef | null, now = Date.now()): void {
  try {
    if (ref) {
      localStorage.setItem(
        PENDING_BOOK_KEY,
        JSON.stringify({ ref: `${ref.language}/${ref.slug}`, savedAt: now }),
      );
    } else {
      localStorage.removeItem(PENDING_BOOK_KEY);
    }
  } catch {
    /* storage can be blocked; the reader then picks a first book in setup */
  }
}
