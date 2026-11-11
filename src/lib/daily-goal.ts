/** Mirrors api/src/lib/daily-goal.ts: the daily goal behind the streak. */
export type DailyGoalKind = 'minutes' | 'reviews';

export interface DailyGoal {
  kind: DailyGoalKind;
  target: number;
}

export const DEFAULT_DAILY_GOAL: DailyGoal = { kind: 'minutes', target: 5 };

export const DAILY_GOAL_PRESETS: DailyGoal[] = [
  { kind: 'minutes', target: 5 },
  { kind: 'minutes', target: 10 },
  { kind: 'minutes', target: 15 },
  { kind: 'minutes', target: 20 },
  { kind: 'minutes', target: 30 },
  { kind: 'reviews', target: 10 },
  { kind: 'reviews', target: 20 },
  { kind: 'reviews', target: 30 },
];

export const goalKey = (goal: DailyGoal) => `${goal.kind}:${goal.target}`;

export function goalFromKey(key: string): DailyGoal | null {
  return DAILY_GOAL_PRESETS.find((goal) => goalKey(goal) === key) ?? null;
}

/** Fired on window after a write that changes today's stats or the goal. */
export const DAILY_STATS_EVENT = 'readfox:daily-stats';

export interface StreakStatus {
  streak: number;
  longest: number;
  practicedToday: boolean;
  goal: DailyGoal;
  goalProgress: number;
  goalMetToday: boolean;
}
