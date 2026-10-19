import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ANNOUNCEMENTS,
  PANEL_LIMIT,
  parseAnnouncementState,
  pickBanner,
  pruneAnnouncementState,
  unseenCount,
  visibleAnnouncements,
  type Announcement,
} from './announcements';

const day = (iso: string) => Date.parse(iso);
const entry = (id: string, date: string, extra: Partial<Announcement> = {}): Announcement => ({
  id,
  date,
  level: 'info',
  ...extra,
});

describe('visibleAnnouncements', () => {
  const now = day('2026-11-01T12:00:00Z');
  const signedUpAt = day('2026-10-10T08:00:00Z');

  it('hides entries older than the account, in the future, or expired', () => {
    const list = visibleAnnouncements(
      [
        entry('old', '2026-10-01'),
        entry('ok', '2026-10-20'),
        entry('future', '2026-11-05'),
        entry('expired', '2026-10-15', { expires: '2026-10-30' }),
        entry('live', '2026-10-16', { expires: '2026-12-01' }),
      ],
      { now, signedUpAt },
    );
    expect(list.map((e) => e.id)).toEqual(['ok', 'live']);
  });

  it('sorts newest first and keeps the panel limit', () => {
    const many = Array.from({ length: PANEL_LIMIT + 3 }, (_, i) =>
      entry(`e${i}`, `2026-10-${String(11 + i).padStart(2, '0')}`),
    );
    const list = visibleAnnouncements(many, { now, signedUpAt });
    expect(list).toHaveLength(PANEL_LIMIT);
    expect(list[0].id).toBe(`e${PANEL_LIMIT + 2}`);
  });

  it('ignores an entry with an unreadable date', () => {
    expect(visibleAnnouncements([entry('bad', 'soon')], { now, signedUpAt })).toEqual([]);
  });
});

describe('seen and dismissed state', () => {
  const list = [
    entry('a', '2026-10-20'),
    entry('b', '2026-10-19', { level: 'important' }),
    entry('c', '2026-10-18', { level: 'important' }),
  ];

  it('counts entries that are not seen', () => {
    expect(unseenCount(list, { seen: [], dismissed: [] })).toBe(3);
    expect(unseenCount(list, { seen: ['a', 'b'], dismissed: [] })).toBe(1);
  });

  it('picks the newest important entry that is not dismissed', () => {
    expect(pickBanner(list, { seen: [], dismissed: [] })?.id).toBe('b');
    expect(pickBanner(list, { seen: [], dismissed: ['b'] })?.id).toBe('c');
    expect(pickBanner(list, { seen: [], dismissed: ['b', 'c'] })).toBeUndefined();
    expect(pickBanner([entry('a', '2026-10-20')], { seen: [], dismissed: [] })).toBeUndefined();
  });

  it('parses stored text and survives bad data', () => {
    expect(parseAnnouncementState(null)).toEqual({ seen: [], dismissed: [] });
    expect(parseAnnouncementState('{oops')).toEqual({ seen: [], dismissed: [] });
    expect(parseAnnouncementState('{"seen":["a",3],"dismissed":"x"}')).toEqual({
      seen: ['a'],
      dismissed: [],
    });
  });

  it('drops ids that no longer exist', () => {
    expect(pruneAnnouncementState({ seen: ['a', 'gone'], dismissed: ['gone'] }, list)).toEqual({
      seen: ['a'],
      dismissed: [],
    });
  });
});

describe('announcement texts', () => {
  const locales = ['en', 'zh-CN'].map((code) => ({
    code,
    items: (
      JSON.parse(readFileSync(join(process.cwd(), 'messages', `${code}.json`), 'utf8')) as {
        announcements: { items: Record<string, { title?: string; body?: string }> };
      }
    ).announcements.items,
  }));

  it('has a title and a body in every locale for every entry', () => {
    for (const { code, items } of locales) {
      for (const { id } of ANNOUNCEMENTS) {
        expect(items[id]?.title, `${code} ${id} title`).toBeTruthy();
        expect(items[id]?.body, `${code} ${id} body`).toBeTruthy();
      }
    }
  });

  it('uses each id once, newest first', () => {
    const ids = ANNOUNCEMENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const dates = ANNOUNCEMENTS.map((e) => e.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });
});
