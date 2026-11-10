import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PENDING_BOOK_KEY,
  parseBookRef,
  readPendingBook,
  registerHrefForBook,
  writePendingBook,
} from './pending-book';

const DAY = 24 * 60 * 60 * 1000;

describe('parseBookRef', () => {
  it('accepts a library language and slug', () => {
    expect(parseBookRef('en/a-christmas-carol')).toEqual({
      language: 'en',
      slug: 'a-christmas-carol',
    });
  });

  it('rejects anything that is not a known language and a plain slug', () => {
    for (const value of [
      null,
      '',
      'en',
      'xx/a-book',
      'en/../secret',
      'en/A-Book',
      'en/a book',
      'en/a-book/extra',
      '//evil.example/x',
    ]) {
      expect(parseBookRef(value)).toBeNull();
    }
  });
});

describe('registerHrefForBook', () => {
  it('round-trips through the query string', () => {
    const href = registerHrefForBook({ language: 'fr', slug: 'candide' });
    const book = new URL(href, 'https://readfox.app').searchParams.get('book');
    expect(parseBookRef(book)).toEqual({ language: 'fr', slug: 'candide' });
  });
});

describe('pending book store', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the book that was written', () => {
    writePendingBook({ language: 'en', slug: 'the-happy-prince' }, 1000);
    expect(readPendingBook(1000 + DAY)).toEqual({ language: 'en', slug: 'the-happy-prince' });
  });

  it('forgets a book after seven days', () => {
    writePendingBook({ language: 'en', slug: 'the-happy-prince' }, 1000);
    expect(readPendingBook(1000 + 7 * DAY + 1)).toBeNull();
  });

  it('clears the store on null', () => {
    writePendingBook({ language: 'en', slug: 'the-happy-prince' });
    writePendingBook(null);
    expect(store[PENDING_BOOK_KEY]).toBeUndefined();
    expect(readPendingBook()).toBeNull();
  });

  it('ignores a damaged or tampered value', () => {
    store[PENDING_BOOK_KEY] = '{not json';
    expect(readPendingBook()).toBeNull();
    store[PENDING_BOOK_KEY] = JSON.stringify({ ref: 'en/../x', savedAt: Date.now() });
    expect(readPendingBook()).toBeNull();
  });

  it('returns null when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {},
    });
    expect(() => writePendingBook({ language: 'en', slug: 'a-book' })).not.toThrow();
    expect(readPendingBook()).toBeNull();
  });
});
