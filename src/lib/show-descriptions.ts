'use client';

import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'readfox-show-descriptions';
const EVENT = 'readfox-show-descriptions';

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
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

/** Whether book and article descriptions are shown. On by default; one choice for every list. */
export function useShowDescriptions(): [boolean, (show: boolean) => void] {
  const show = useSyncExternalStore(subscribe, read, () => true);
  const set = useCallback((next: boolean) => {
    try {
      localStorage.setItem(KEY, next ? '1' : '0');
    } catch {
      // the choice then lasts until reload
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [show, set];
}
