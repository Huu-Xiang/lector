import '../../test-guard';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { db } from '../../db';
import { backfillWordCards } from './backfill';
import type { WordCardRow } from './word-card-rows';

const USER = 'local';
const NOW = Date.parse('2026-11-04T12:00:00Z');
const DAY = 86_400_000;
const TS = '2026-01-01T00:00:00Z';

function clear() {
  db.prepare('DELETE FROM wordCards').run();
  db.prepare('DELETE FROM clozeSentences').run();
  db.prepare('DELETE FROM vocab').run();
}

function seedVocab(id: string, text: string, state: string, language = 'en') {
  db.prepare(
    `INSERT INTO vocab (id, text, type, sentence, translation, state, stateUpdatedAt, createdAt, language)
     VALUES (?, ?, 'word', 's', 't', ?, ?, ?, ?)`,
  ).run(id, text, state, TS, TS, language);
}

function cards(language = 'en') {
  return db
    .prepare('SELECT * FROM wordCards WHERE userId = ? AND language = ?')
    .all(USER, language) as WordCardRow[];
}

describe('backfillWordCards', () => {
  beforeEach(clear);
  afterEach(clear);

  test('300 mixed words: New cards for level 1, seeded Review cards for 2-4, 20 a day, idempotent', () => {
    const states = ['level1', 'level2', 'level3', 'level4', 'known', 'ignored'];
    for (let i = 0; i < 300; i++) seedVocab(`v${i}`, `word${i}`, states[i % states.length]);

    expect(backfillWordCards(USER, 'en', NOW)).toBe(200);
    const rows = cards();
    expect(rows).toHaveLength(200);
    expect(rows.filter((r) => r.state === 'new')).toHaveLength(50);
    expect(rows.filter((r) => r.state === 'new').every((r) => r.introducedAt === null)).toBe(true);

    const seeded = rows.filter((r) => r.state === 'review');
    expect(seeded).toHaveLength(150);
    const perDay = new Map<number, number>();
    for (const row of seeded) {
      const day = Math.floor(Date.parse(row.due) / DAY);
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(20);
    expect(seeded.every((r) => Date.parse(r.due) >= NOW + 2 * DAY)).toBe(true);
    expect(rows.find((r) => r.wordKey === 'word2')!.stability).toBe(10);

    expect(backfillWordCards(USER, 'en', NOW)).toBe(0);
    expect(cards()).toHaveLength(200);
  });

  test('keeps words in other languages apart and skips words that already have a card', () => {
    seedVocab('a', 'pain', 'level1', 'fr');
    seedVocab('b', 'pain', 'level1', 'es');
    seedVocab('c', 'harbor', 'level2');
    expect(backfillWordCards(USER, 'fr', NOW)).toBe(1);
    expect(cards('fr')).toHaveLength(1);
    expect(cards('es')).toHaveLength(0);

    backfillWordCards(USER, 'en', NOW);
    db.prepare("UPDATE wordCards SET reps = 7 WHERE wordKey = 'harbor'").run();
    expect(backfillWordCards(USER, 'en', NOW)).toBe(0);
    expect(cards().find((r) => r.wordKey === 'harbor')!.reps).toBe(7);
  });

  test('an onboarding mined card seeds the word card and is blacklisted', () => {
    seedVocab('v1', 'harbor', 'level1');
    db.prepare(
      `INSERT INTO clozeSentences
         (userId, id, sentence, clozeWord, clozeIndex, translation, source, collection, vocabEntryId,
          masteryLevel, nextReview, reviewCount, lastReviewed, timesCorrect, timesIncorrect, blacklisted, language)
       VALUES (?, 'onboarding:v1', 'The harbor is calm.', 'harbor', 1, 't', 'mined', 'mined', 'v1',
          50, ?, 2, ?, 2, 0, 0, 'en')`,
    ).run(USER, new Date(NOW + 5 * DAY).toISOString(), new Date(NOW - 2 * DAY).toISOString());

    backfillWordCards(USER, 'en', NOW);

    const row = cards()[0];
    expect(row.state).toBe('review');
    expect(row.reps).toBe(2);
    expect(row.stability).toBeCloseTo(7, 5);
    const mined = db
      .prepare("SELECT blacklisted FROM clozeSentences WHERE id = 'onboarding:v1'")
      .get() as { blacklisted: number };
    expect(mined.blacklisted).toBe(1);
  });
});
