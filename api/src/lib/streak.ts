// Mirror of src/lib/streak.ts for the Bun API — keep in sync.
// Single source of truth for streak math (issue #108): a day counts toward
// the streak when any study activity happened (lookup, practice, reading, or
// an Anki review synced into dailyStats.ankiReviews).

import { addDaysToDateString } from './dates';

export interface DailyActivityRow {
  date: string;
  dictionaryLookups?: number | null;
  clozePracticed?: number | null;
  minutesRead?: number | null;
  ankiReviews?: number | null;
}

export function isActiveDay(row: DailyActivityRow): boolean {
  return (
    (row.dictionaryLookups ?? 0) > 0 ||
    (row.clozePracticed ?? 0) > 0 ||
    (row.minutesRead ?? 0) > 0 ||
    (row.ankiReviews ?? 0) > 0
  );
}

export function activeDateSet(rows: DailyActivityRow[]): Set<string> {
  const set = new Set<string>();
  for (const row of rows) {
    if (isActiveDay(row)) set.add(row.date);
  }
  return set;
}

export interface StreakResult {
  current: number;
  longest: number;
  activeToday: boolean;
}

/**
 * Compute current and longest streaks from a set of active YYYY-MM-DD dates.
 * `today` must already be expressed in the user's configured time zone.
 */
export function computeStreaks(activeDates: Set<string>, today: string): StreakResult {
  const activeToday = activeDates.has(today);

  let current = 0;
  let cursor = activeToday ? today : addDaysToDateString(today, -1);
  while (activeDates.has(cursor)) {
    current++;
    cursor = addDaysToDateString(cursor, -1);
  }

  let longest = 0;
  for (const date of activeDates) {
    if (activeDates.has(addDaysToDateString(date, -1))) continue; // not a run start
    let length = 1;
    let next = addDaysToDateString(date, 1);
    while (activeDates.has(next)) {
      length++;
      next = addDaysToDateString(next, 1);
    }
    if (length > longest) longest = length;
  }

  return { current, longest, activeToday };
}

export type GoalKind = 'minutes' | 'reviews';

/** Today's amount toward the goal: reading minutes, or words answered in review and practice. */
export function goalAmount(rows: DailyActivityRow[], kind: GoalKind): number {
  let total = 0;
  for (const row of rows) {
    total += (kind === 'minutes' ? row.minutesRead : row.clozePracticed) ?? 0;
  }
  return total;
}

/**
 * Streak days under a daily goal. Rows may hold one day several times (one row per
 * language); their amounts add up. A day before `since` counts with any activity.
 */
export function goalDateSet(
  rows: DailyActivityRow[],
  goal: { kind: GoalKind; target: number },
  since: string | null,
): Set<string> {
  const byDate = new Map<string, DailyActivityRow[]>();
  for (const row of rows) {
    const list = byDate.get(row.date);
    if (list) list.push(row);
    else byDate.set(row.date, [row]);
  }
  const days = new Set<string>();
  for (const [date, dayRows] of byDate) {
    const met =
      since !== null && date < since
        ? dayRows.some(isActiveDay)
        : goalAmount(dayRows, goal.kind) >= goal.target;
    if (met) days.add(date);
  }
  return days;
}
