'use client';

import { useCallback, useSyncExternalStore } from 'react';

export type LibraryView = 'grid' | 'list';

const KEY = 'readfox-library-view';
const EVENT = 'readfox-library-view';

function read(): LibraryView {
  try {
    return localStorage.getItem(KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(EVENT, callback);
  };
}

/** How the library lists books: cards in a grid (default) or one row each. Saved on this device. */
export function useLibraryView(): [LibraryView, (view: LibraryView) => void] {
  const view = useSyncExternalStore(subscribe, read, () => 'grid' as const);
  const set = useCallback((next: LibraryView) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // the choice then lasts until reload
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [view, set];
}
