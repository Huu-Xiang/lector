import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import {
  DEFAULT_DAILY_GOAL,
  ensureGoalStreakSince,
  goalStreakSince,
  parseDailyGoal,
  readDailyGoal,
} from './daily-goal';
import { computeStreaks, goalDateSet } from './streak';

function memoryDb(): Database {
  const database = new Database(':memory:');
  database.exec(`
    CREATE TABLE settings (userId TEXT, key TEXT, value TEXT, PRIMARY KEY (userId, key));
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updatedAt TEXT NOT NULL);
  `);
  return database;
}

describe('parseDailyGoal', () => {
  test('accepts a minutes or a reviews goal inside its bounds', () => {
    expect(parseDailyGoal({ kind: 'minutes', target: 5 })).toEqual({ kind: 'minutes', target: 5 });
    expect(parseDailyGoal({ kind: 'reviews', target: 200 })).toEqual({
      kind: 'reviews',
      target: 200,
    });
  });

  test('rejects other kinds, fractions and values out of bounds', () => {
    expect(parseDailyGoal({ kind: 'pages', target: 5 })).toBeNull();
    expect(parseDailyGoal({ kind: 'minutes', target: 0 })).toBeNull();
    expect(parseDailyGoal({ kind: 'minutes', target: 121 })).toBeNull();
    expect(parseDailyGoal({ kind: 'minutes', target: 2.5 })).toBeNull();
    expect(parseDailyGoal('minutes:5')).toBeNull();
    expect(parseDailyGoal(null)).toBeNull();
  });
});

describe('readDailyGoal', () => {
  test('returns the stored goal, and the default when none or a broken one is stored', () => {
    const database = memoryDb();
    expect(readDailyGoal(database, 'u1')).toEqual(DEFAULT_DAILY_GOAL);
    database
      .prepare('INSERT INTO settings (userId, key, value) VALUES (?, ?, ?)')
      .run('u1', 'dailyGoal', JSON.stringify({ kind: 'reviews', target: 20 }));
    expect(readDailyGoal(database, 'u1')).toEqual({ kind: 'reviews', target: 20 });
    database
      .prepare('INSERT INTO settings (userId, key, value) VALUES (?, ?, ?)')
      .run('u2', 'dailyGoal', '{not json');
    expect(readDailyGoal(database, 'u2')).toEqual(DEFAULT_DAILY_GOAL);
  });
});

describe('goalStreakSince', () => {
  test('keeps the first recorded day', () => {
    const database = memoryDb();
    expect(goalStreakSince(database)).toBeNull();
    ensureGoalStreakSince(database, '2026-11-12');
    ensureGoalStreakSince(database, '2026-12-01');
    expect(goalStreakSince(database)).toBe('2026-11-12');
  });
});

describe('goalDateSet', () => {
  const goal = { kind: 'minutes' as const, target: 10 };

  test('a day counts when its minutes, summed over languages, reach the target', () => {
    const days = goalDateSet(
      [
        { date: '2026-11-20', minutesRead: 6 },
        { date: '2026-11-20', minutesRead: 4 },
        { date: '2026-11-21', minutesRead: 9, dictionaryLookups: 30 },
      ],
      goal,
      '2026-11-12',
    );
    expect([...days]).toEqual(['2026-11-20']);
  });

  test('a reviews goal counts answered words, not reading time', () => {
    const days = goalDateSet(
      [
        { date: '2026-11-20', clozePracticed: 20 },
        { date: '2026-11-21', minutesRead: 60, clozePracticed: 19 },
      ],
      { kind: 'reviews', target: 20 },
      null,
    );
    expect([...days]).toEqual(['2026-11-20']);
  });

  test('days before the goal existed keep counting with any activity', () => {
    const days = goalDateSet(
      [
        { date: '2026-11-10', dictionaryLookups: 1 },
        { date: '2026-11-11', minutesRead: 1 },
        { date: '2026-11-12', minutesRead: 10 },
        { date: '2026-11-13', minutesRead: 1 },
      ],
      goal,
      '2026-11-12',
    );
    expect(computeStreaks(days, '2026-11-12')).toEqual({
      current: 3,
      longest: 3,
      activeToday: true,
    });
    expect(days.has('2026-11-13')).toBe(false);
  });
});
