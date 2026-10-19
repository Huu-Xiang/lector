'use client';

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import {
  ANNOUNCEMENTS,
  parseAnnouncementState,
  pickBanner,
  pruneAnnouncementState,
  unseenCount,
  visibleAnnouncements,
  type AnnouncementState,
} from './announcements';

const STORAGE_KEY = 'readfox-announcements-v1';
const CHANGE_EVENT = 'readfox-announcements-change';

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function update(change: (state: AnnouncementState) => AnnouncementState): void {
  const next = pruneAnnouncementState(change(parseAnnouncementState(readRaw())), ANNOUNCEMENTS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage can be blocked; the state then lasts until reload */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

const withIds = (ids: string[], more: string[]) => [...new Set([...ids, ...more])];

/** `signedUpAt` is a timestamp in ms; entries older than the account stay hidden. */
export function useAnnouncements(signedUpAt: number) {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const [now] = useState(() => Date.now());
  const state = useMemo(() => parseAnnouncementState(raw), [raw]);
  const list = useMemo(
    () => visibleAnnouncements(ANNOUNCEMENTS, { now, signedUpAt }),
    [now, signedUpAt],
  );

  const markSeen = useCallback(() => {
    const ids = list.map((entry) => entry.id);
    update((s) => ({ ...s, seen: withIds(s.seen, ids) }));
  }, [list]);

  const dismiss = useCallback((id: string) => {
    update((s) => ({ seen: withIds(s.seen, [id]), dismissed: withIds(s.dismissed, [id]) }));
  }, []);

  return {
    list,
    unseen: unseenCount(list, state),
    banner: pickBanner(list, state),
    markSeen,
    dismiss,
  };
}
