import '../../test-guard';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { db } from '../../db';
import { backfillWordCards } from './backfill';
import { reconcileWordCards } from './reconcile';
import { stageOf } from './stages';
import { reviewCardOf, type WordCardRow } from './word-card-rows';

const USER = 'local';
const NOW = Date.parse('2026-11-04T12:00:00Z');
const TS = '2026-01-01T00:00:00Z';
const LATER = '2026-11-05T00:00:00Z';

function clear() {
  db.prepare('DELETE FROM wordCards').run();
  db.prepare('DELETE FROM vocab').run();
}

function seedVocab(id: string, text: string, state: string) {
  db.prepare(
    `INSERT INTO vocab (id, text, type, sentence, translation, state, stateUpdatedAt, createdAt, language)
     VALUES (?, ?, 'word', 's', 't', ?, ?, ?, 'en')`,
  ).run(id, text, state, TS, TS);
}

function cards() {
  return db
    .prepare("SELECT * FROM wordCards WHERE userId = ? AND language = 'en'")
    .all(USER) as WordCardRow[];
}

describe('reconcileWordCards', () => {
  beforeEach(clear);
  afterEach(clear);

  test('a vocab row inserted directly gets a card; a known one does not', () => {
    seedVocab('v1', 'harbor', 'level3');
    seedVocab('v2', 'quay', 'known');
    reconcileWordCards(USER, 'en', NOW);

    const rows = cards();
    expect(rows.map((r) => r.wordKey)).toEqual(['harbor']);
    expect(rows[0].stability).toBe(10);
    expect(rows[0].vocabId).toBe('v1');
  });

  test('a vocab row deleted directly removes its card', () => {
    seedVocab('v1', 'harbor', 'level2');
    reconcileWordCards(USER, 'en', NOW);
    db.prepare('DELETE FROM vocab').run();
    reconcileWordCards(USER, 'en', NOW);
    expect(cards()).toHaveLength(0);
  });

  test('a state changed directly re-syncs the card, once', () => {
    seedVocab('v1', 'harbor', 'level2');
    backfillWordCards(USER, 'en', NOW);
    db.prepare("UPDATE vocab SET state = 'level3', stateUpdatedAt = ?").run(LATER);
    reconcileWordCards(USER, 'en', NOW + 1000);

    expect(stageOf(reviewCardOf(cards()[0]))).toBe('familiar');

    db.prepare('UPDATE wordCards SET stability = 12').run();
    reconcileWordCards(USER, 'en', NOW + 2000);
    expect(cards()[0].stability).toBe(12);
  });

  test('a word marked known directly retires its card', () => {
    seedVocab('v1', 'harbor', 'level2');
    backfillWordCards(USER, 'en', NOW);
    db.prepare("UPDATE vocab SET state = 'known', stateUpdatedAt = ?").run(LATER);
    reconcileWordCards(USER, 'en', NOW + 1000);
    expect(cards()[0].retiredAt).not.toBeNull();
  });

  test('a state that is not newer than the card leaves it alone', () => {
    seedVocab('v1', 'harbor', 'level2');
    backfillWordCards(USER, 'en', NOW);
    db.prepare('UPDATE wordCards SET stability = 5, lastSyncedAt = ?').run(LATER);
    db.prepare("UPDATE vocab SET state = 'level4', stateUpdatedAt = ?").run('2026-11-04T13:00:00Z');
    reconcileWordCards(USER, 'en', NOW);
    expect(cards()[0].stability).toBe(5);
  });
});
