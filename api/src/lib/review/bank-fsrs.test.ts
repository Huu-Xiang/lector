import '../../test-guard';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { db } from '../../db';
import { stageOf } from './stages';
import {
  bankFsrsNeedsSeed,
  loadBankCard,
  masteryForCard,
  writeBankCard,
  type BankFsrsRow,
} from './bank-fsrs';

const NOW = Date.parse('2026-11-04T12:00:00Z');
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

function clear() {
  db.prepare("DELETE FROM clozeSentences WHERE id LIKE 'bf-%'").run();
}

function insert(id: string, fields: Record<string, unknown> = {}) {
  const row = {
    masteryLevel: 0,
    nextReview: iso(NOW),
    reviewCount: 0,
    lastReviewed: null,
    timesCorrect: 0,
    timesIncorrect: 0,
    ...fields,
  };
  const columns = Object.keys(row);
  db.prepare(
    `INSERT INTO clozeSentences (id, sentence, clozeWord, clozeIndex, translation, source, collection, language, userId, ${columns.join(',')})
     VALUES (?, 's', 'w', 0, 't', 'tatoeba', 'random', 'af', 'local', ${columns.map(() => '?').join(',')})`,
  ).run(id, ...(Object.values(row) as never[]));
  return db.prepare('SELECT * FROM clozeSentences WHERE id = ?').get(id) as BankFsrsRow;
}

describe('loadBankCard', () => {
  beforeEach(clear);
  afterEach(clear);

  test('mastery 50 reviewed 3 days before nextReview seeds Review with stability 3 and keeps the due time', () => {
    const due = NOW + 2 * DAY;
    const row = insert('bf-1', {
      masteryLevel: 50,
      reviewCount: 4,
      timesCorrect: 3,
      timesIncorrect: 1,
      lastReviewed: iso(due - 3 * DAY),
      nextReview: iso(due),
    });
    const card = loadBankCard(row, NOW);
    expect(card.state).toBe('review');
    expect(card.stability).toBeCloseTo(3, 5);
    expect(card.due).toBe(due);
  });

  test('mastery 0 with no reviews stays New', () => {
    const card = loadBankCard(insert('bf-2'), NOW);
    expect(card.state).toBe('new');
    expect(stageOf(card)).toBe('new');
  });

  test('stored FSRS state is used as is when it is current', () => {
    const lastReviewed = iso(NOW - DAY);
    const row = insert('bf-3', {
      masteryLevel: 75,
      reviewCount: 5,
      lastReviewed,
      nextReview: iso(NOW + 8 * DAY),
    });
    const stored = { ...loadBankCard(row, NOW), stability: 12.5 };
    writeBankCard('local', 'bf-3', 'af', stored, lastReviewed);
    const reread = db
      .prepare('SELECT * FROM clozeSentences WHERE id = ?')
      .get('bf-3') as BankFsrsRow;
    expect(bankFsrsNeedsSeed(reread)).toBe(false);
    expect(loadBankCard(reread, NOW)).toEqual(stored);
  });

  test('a lastReviewed newer than fsrsUpdatedAt re-seeds', () => {
    const row = insert('bf-4', {
      masteryLevel: 50,
      reviewCount: 2,
      lastReviewed: iso(NOW - 10 * DAY),
      nextReview: iso(NOW - 7 * DAY),
    });
    writeBankCard('local', 'bf-4', 'af', loadBankCard(row, NOW), iso(NOW - 10 * DAY));
    db.prepare(
      'UPDATE clozeSentences SET lastReviewed = ?, nextReview = ?, masteryLevel = 75 WHERE id = ?',
    ).run(iso(NOW - DAY), iso(NOW + 6 * DAY), 'bf-4');
    const reread = db
      .prepare('SELECT * FROM clozeSentences WHERE id = ?')
      .get('bf-4') as BankFsrsRow;
    expect(bankFsrsNeedsSeed(reread)).toBe(true);
    const card = loadBankCard(reread, NOW);
    expect(card.stability).toBeCloseTo(7, 5);
    expect(card.due).toBe(NOW + 6 * DAY);
  });
});

describe('masteryForCard', () => {
  test('maps stages to the legacy mastery levels', () => {
    const base = loadBankCard(
      insert('bf-5', { masteryLevel: 50, reviewCount: 1, lastReviewed: iso(NOW - DAY) }),
      NOW,
    );
    expect(masteryForCard({ ...base, state: 'new' })).toBe(0);
    expect(masteryForCard({ ...base, state: 'learning' })).toBe(25);
    expect(masteryForCard({ ...base, state: 'review', stability: 10 })).toBe(75);
    expect(masteryForCard({ ...base, state: 'review', stability: 40 })).toBe(100);
    clear();
  });
});
