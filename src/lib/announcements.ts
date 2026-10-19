export type AnnouncementLevel = 'info' | 'important';

export interface Announcement {
  /** Message key under `announcements.items`. Never reuse or rename an id. */
  id: string;
  /** Publish day, `YYYY-MM-DD`, read as UTC midnight. A future day stays hidden. */
  date: string;
  /** `important` also shows a banner on the library page. */
  level: AnnouncementLevel;
  /** Day after which the entry is hidden everywhere. */
  expires?: string;
  /** In-app path for the optional link. */
  href?: string;
}

export interface AnnouncementState {
  seen: string[];
  dismissed: string[];
}

export const EMPTY_ANNOUNCEMENT_STATE: AnnouncementState = { seen: [], dismissed: [] };

export const PANEL_LIMIT = 5;

/** Newest first. Add an entry here and its texts in `messages/src/<locale>/announcements.json`. */
export const ANNOUNCEMENTS: Announcement[] = [
  { id: 'inviteCodes', date: '2026-10-19', level: 'important', href: '/settings' },
  { id: 'skipGuide', date: '2026-10-19', level: 'info' },
];

/** Entries a signed-in user may see: published after sign-up, not in the future, not expired. */
export function visibleAnnouncements(
  all: Announcement[],
  { now, signedUpAt }: { now: number; signedUpAt: number },
): Announcement[] {
  return all
    .filter((entry) => {
      const published = Date.parse(entry.date);
      if (Number.isNaN(published) || published > now || published < signedUpAt) return false;
      return !entry.expires || Date.parse(entry.expires) > now;
    })
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, PANEL_LIMIT);
}

export function unseenCount(list: Announcement[], state: AnnouncementState): number {
  return list.filter((entry) => !state.seen.includes(entry.id)).length;
}

export function pickBanner(
  list: Announcement[],
  state: AnnouncementState,
): Announcement | undefined {
  return list.find((entry) => entry.level === 'important' && !state.dismissed.includes(entry.id));
}

export function parseAnnouncementState(raw: string | null): AnnouncementState {
  if (!raw) return EMPTY_ANNOUNCEMENT_STATE;
  try {
    const value = JSON.parse(raw) as Partial<AnnouncementState> | null;
    const ids = (list: unknown) =>
      Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [];
    return { seen: ids(value?.seen), dismissed: ids(value?.dismissed) };
  } catch {
    return EMPTY_ANNOUNCEMENT_STATE;
  }
}

/** Keep only ids that still exist, so the stored state cannot grow without limit. */
export function pruneAnnouncementState(
  state: AnnouncementState,
  all: Announcement[],
): AnnouncementState {
  const known = new Set(all.map((entry) => entry.id));
  return {
    seen: state.seen.filter((id) => known.has(id)),
    dismissed: state.dismissed.filter((id) => known.has(id)),
  };
}
