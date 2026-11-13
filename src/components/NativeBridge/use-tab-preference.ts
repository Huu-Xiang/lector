'use client';

import { useSyncExternalStore } from 'react';
import { type OptionalTab, parseOptionalTab } from './tab-bar';

const KEY = 'readfox-mobile-extra-tab';
let current: OptionalTab | undefined;

function read(): OptionalTab {
  if (current !== undefined) return current;
  try {
    return parseOptionalTab(localStorage.getItem(KEY));
  } catch {
    return 'none';
  }
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(KEY, callback);
  return () => window.removeEventListener(KEY, callback);
}

function write(value: OptionalTab) {
  current = value;
  try {
    localStorage.setItem(KEY, value);
  } catch {}
  window.dispatchEvent(new Event(KEY));
}

export function useTabPreference() {
  return [useSyncExternalStore(subscribe, read, () => 'none' as const), write] as const;
}
