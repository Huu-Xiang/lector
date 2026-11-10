import '../test-guard';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { db } from '../db';
import { defaultLifecycleDeps, reviewWordCount } from './lifecycle-email';
import { getCounts } from './review/queue';

const USER = 'local';
const NOW = Date.parse('2026-11-04T12:00:00Z');
const TS = '2026-01-01T00:00:00Z';

function clear() {
  db.prepare('DELETE FROM wordCards').run();
  db.prepare('DELETE FROM vocab').run();
}

describe('review-due word count', () => {
  beforeEach(clear);
  afterEach(clear);

  test('counts saved words that have no card yet, like the review page', () => {
    for (let i = 0; i < 6; i++) {
      db.prepare(
        `INSERT INTO vocab (id, text, type, sentence, translation, state, stateUpdatedAt, createdAt, language)
         VALUES (?, ?, 'word', 's', 't', 'level1', ?, ?, 'en')`,
      ).run(`legacy-${i}`, `legacy${i}`, TS, TS);
    }
    const raw = getCounts(USER, 'en', NOW);
    expect(raw.dueNow + raw.newAvailable).toBe(0);

    expect(reviewWordCount(USER, 'en', NOW)).toBe(6);
    expect(defaultLifecycleDeps().reviewCount).toBe(reviewWordCount);
  });
});
