import type { Database } from 'bun:sqlite';

/** `minutes`: minutes of active reading. `reviews`: words answered in review or practice. */
export type DailyGoalKind = 'minutes' | 'reviews';

export interface DailyGoal {
  kind: DailyGoalKind;
  target: number;
}

export const DEFAULT_DAILY_GOAL: DailyGoal = { kind: 'minutes', target: 5 };

/** Inclusive target bounds per kind. */
export const DAILY_GOAL_LIMITS: Record<DailyGoalKind, [number, number]> = {
  minutes: [1, 120],
  reviews: [1, 200],
};

export function parseDailyGoal(value: unknown): DailyGoal | null {
  if (!value || typeof value !== 'object') return null;
  const { kind, target } = value as { kind?: unknown; target?: unknown };
  if (kind !== 'minutes' && kind !== 'reviews') return null;
  const [min, max] = DAILY_GOAL_LIMITS[kind];
  if (typeof target !== 'number' || !Number.isInteger(target) || target < min || target > max) {
    return null;
  }
  return { kind, target };
}

/** The account's goal; the default when none is stored or the stored value is invalid. */
export function readDailyGoal(database: Database, userId: string): DailyGoal {
  const row = database
    .prepare('SELECT value FROM settings WHERE userId = ? AND key = ?')
    .get(userId, 'dailyGoal') as { value: string } | undefined;
  if (!row) return DEFAULT_DAILY_GOAL;
  try {
    return parseDailyGoal(JSON.parse(row.value)) ?? DEFAULT_DAILY_GOAL;
  } catch {
    return DEFAULT_DAILY_GOAL;
  }
}

const GOAL_STREAK_SINCE = 'goalStreakSince';

/** Records, once, the UTC day from which a streak day needs the goal. */
export function ensureGoalStreakSince(database: Database, today: string): void {
  database
    .prepare('INSERT OR IGNORE INTO app_settings (key, value, updatedAt) VALUES (?, ?, ?)')
    .run(GOAL_STREAK_SINCE, today, new Date().toISOString());
}

/** Days before this date count toward the streak with any activity; null means always the goal. */
export function goalStreakSince(database: Database): string | null {
  const row = database
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(GOAL_STREAK_SINCE) as { value: string } | undefined;
  return row?.value ?? null;
}
