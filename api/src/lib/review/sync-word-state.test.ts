import '../../test-guard';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { db } from '../../db';
import { stageOf } from './stages';
import { reviewCardOf, type WordCardRow } from './word-card-rows';
import { syncWordDelete, syncWordState } from './sync-word-state';

const USER = 'local';
const NOW = Date.parse('2026-11-04T12:00:00Z');
const TS = '2026-01-01T00:00:00Z';

function clear() {
  db.prepare('DELETE FROM wordCards').run();
  db.prepare('DELETE FROM knownWords').run();
  db.prepare('DELETE FROM vocab').run();
}

function seedVocab(
  id: string,
  text: string,
  opts: { state?: string; language?: string; type?: string; createdAt?: string } = {},
) {
  db.prepare(
    `INSERT INTO vocab (id, text, type, sentence, translation, state, stateUpdatedAt, createdAt, language)
     VALUES (?, ?, ?, 's', 't', ?, ?, ?, ?)`,
  ).run(
    id,
    text,
    opts.type ?? 'word',
    opts.state ?? 'level1',
    TS,
    opts.createdAt ?? TS,
    opts.language ?? 'en',
  );
}

function cards(language = 'en') {
  return db
    .prepare('SELECT * FROM wordCards WHERE userId = ? AND language = ? ORDER BY wordKey')
    .all(USER, language) as WordCardRow[];
}

function card(wordKey: string, language = 'en') {
  return cards(language).find((row) => row.wordKey === wordKey);
}

function sync(
  wordKey: string,
  state: Parameters<typeof syncWordState>[0]['state'],
  source: Parameters<typeof syncWordState>[0]['source'],
  extra: Partial<Parameters<typeof syncWordState>[0]> = {},
) {
  db.transaction(() =>
    syncWordState({ userId: USER, language: 'en', wordKey, state, source, now: NOW, ...extra }),
  )();
}

describe('syncWordState', () => {
  beforeEach(clear);
  afterEach(clear);

  test('saving harbor at level 1 creates one New card; saving Harbor again adds none', () => {
    seedVocab('v1', 'harbor');
    sync('harbor', 'level1', 'reader');
    seedVocab('v2', 'Harbor', { createdAt: '2026-02-01T00:00:00Z' });
    sync('harbor', 'level1', 'reader', {
      vocab: { id: 'v2', type: 'word', createdAt: '2026-02-01T00:00:00Z' },
    });

    const rows = cards();
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe('new');
    expect(rows[0].introducedAt).toBeNull();
    expect(rows[0].vocabId).toBe('v2');
    expect(rows[0].type).toBe('word');
    expect(rows[0].lastSyncedAt).toBe(new Date(NOW).toISOString());
  });

  test('a phrase vocab row makes a phrase card', () => {
    seedVocab('v1', 'in the long run', { type: 'phrase' });
    sync('in the long run', 'level1', 'reader');
    expect(card('in the long run')!.type).toBe('phrase');
  });

  test('writes vocab state, stateUpdatedAt and knownWords for the reader source', () => {
    seedVocab('v1', 'harbor');
    sync('harbor', 'level3', 'reader', { vocab: { id: 'v1', type: 'word', createdAt: TS } });

    const vocab = db.prepare('SELECT state, stateUpdatedAt FROM vocab WHERE id = ?').get('v1') as {
      state: string;
      stateUpdatedAt: string;
    };
    expect(vocab.state).toBe('level3');
    expect(vocab.stateUpdatedAt).toBe(new Date(NOW).toISOString());
    const known = db.prepare('SELECT state FROM knownWords WHERE word = ?').get('harbor') as {
      state: string;
    };
    expect(known.state).toBe('level3');
  });

  test('marking quay known retires its card (AE5)', () => {
    seedVocab('v1', 'quay');
    sync('quay', 'level2', 'reader');
    sync('quay', 'known', 'reader');

    expect(card('quay')!.retiredAt).toBe(new Date(NOW).toISOString());
  });

  test('marking a word ignored retires its card for every source', () => {
    for (const source of ['import', 'anki', 'restore'] as const) {
      clear();
      seedVocab('v1', 'quay');
      sync('quay', 'level2', 'reader');
      sync('quay', 'ignored', source);
      expect(card('quay')!.retiredAt).not.toBeNull();
    }
  });

  test('a known state creates no card for a word that has none', () => {
    seedVocab('v1', 'quay', { state: 'known' });
    sync('quay', 'known', 'reader');
    expect(cards()).toHaveLength(0);
  });

  test('setting level 3 in the reader makes the card Familiar with stability 10', () => {
    seedVocab('v1', 'harbor');
    sync('harbor', 'level1', 'reader');
    sync('harbor', 'level3', 'reader');

    const row = card('harbor')!;
    expect(row.state).toBe('review');
    expect(row.stability).toBe(10);
    expect(stageOf(reviewCardOf(row))).toBe('familiar');
  });

  test('the same level again keeps the schedule', () => {
    seedVocab('v1', 'harbor');
    sync('harbor', 'level3', 'reader');
    db.prepare("UPDATE wordCards SET stability = 15, reps = 4 WHERE wordKey = 'harbor'").run();
    sync('harbor', 'level3', 'reader');

    expect(card('harbor')!.stability).toBe(15);
    expect(card('harbor')!.reps).toBe(4);
  });

  test('pressing 4 stores level4, gives a Mastered card and does not retire it', () => {
    seedVocab('v1', 'harbor');
    sync('harbor', 'level2', 'reader', { vocab: { id: 'v1', type: 'word', createdAt: TS } });
    sync('harbor', 'level4', 'reader', { vocab: { id: 'v1', type: 'word', createdAt: TS } });

    const row = card('harbor')!;
    expect(stageOf(reviewCardOf(row))).toBe('mastered');
    expect(row.retiredAt).toBeNull();
    const vocab = db.prepare('SELECT state FROM vocab WHERE id = ?').get('v1') as { state: string };
    expect(vocab.state).toBe('level4');
  });

  test('a reader level on a retired card clears retiredAt and seeds', () => {
    seedVocab('v1', 'quay');
    sync('quay', 'level2', 'reader');
    sync('quay', 'known', 'reader');
    sync('quay', 'level2', 'reader');

    const row = card('quay')!;
    expect(row.retiredAt).toBeNull();
    expect(row.stability).toBe(2);
  });

  test('a known-words bulk import retires an existing card and creates none', () => {
    seedVocab('v1', 'harbor');
    sync('harbor', 'level2', 'reader');
    sync('harbor', 'known', 'import');
    sync('stray', 'level2', 'import');

    expect(card('harbor')!.retiredAt).not.toBeNull();
    expect(card('stray')).toBeUndefined();
    expect(
      (db.prepare('SELECT state FROM knownWords WHERE word = ?').get('harbor') as { state: string })
        .state,
    ).toBe('known');
  });

  test('Anki back-sync to level 2 updates the card stage', () => {
    seedVocab('v1', 'harbor');
    sync('harbor', 'level1', 'reader');
    sync('harbor', 'level2', 'anki', { vocab: { id: 'v1', type: 'word', createdAt: TS } });

    expect(stageOf(reviewCardOf(card('harbor')!))).toBe('learning');
    expect(card('harbor')!.state).toBe('review');
  });

  test('incoming known from Anki retires a non-Mastered card', () => {
    seedVocab('v1', 'harbor');
    sync('harbor', 'level2', 'reader');
    sync('harbor', 'known', 'anki');
    expect(card('harbor')!.retiredAt).not.toBeNull();
  });

  test('a Mastered card keeps its schedule when known comes back through restore or Anki', () => {
    for (const source of ['restore', 'anki'] as const) {
      clear();
      seedVocab('v1', 'harbor');
      sync('harbor', 'level4', 'reader');
      sync('harbor', 'known', 'review');
      sync('harbor', 'known', source);

      const row = card('harbor')!;
      expect(row.retiredAt).toBeNull();
      expect(stageOf(reviewCardOf(row))).toBe('mastered');
    }
  });

  test('review source writes the derived state and keeps the card active', () => {
    seedVocab('v1', 'harbor');
    sync('harbor', 'level2', 'reader');
    db.prepare("UPDATE wordCards SET stability = 40, reps = 3 WHERE wordKey = 'harbor'").run();
    sync('harbor', 'known', 'review', { vocab: { id: 'v1', type: 'word', createdAt: TS } });

    const row = card('harbor')!;
    expect(row.retiredAt).toBeNull();
    expect(row.stability).toBe(40);
    expect(row.reps).toBe(3);
    expect(
      (db.prepare('SELECT state FROM knownWords WHERE word = ?').get('harbor') as { state: string })
        .state,
    ).toBe('known');
  });

  test('keepRows leaves vocab and knownWords untouched', () => {
    seedVocab('v1', 'harbor');
    sync('harbor', 'level3', 'restore', { keepRows: true });

    expect(card('harbor')!.stability).toBe(10);
    expect(
      (db.prepare('SELECT state FROM vocab WHERE id = ?').get('v1') as { state: string }).state,
    ).toBe('level1');
    expect(db.prepare('SELECT 1 FROM knownWords').get()).toBeNull();
  });

  test('the same spelling in French and Spanish gets two cards', () => {
    seedVocab('fr', 'pain', { language: 'fr' });
    seedVocab('es', 'pain', { language: 'es' });
    for (const language of ['fr', 'es']) {
      db.transaction(() =>
        syncWordState({
          userId: USER,
          language,
          wordKey: 'pain',
          state: 'level1',
          source: 'reader',
          now: NOW,
        }),
      )();
    }

    expect(cards('fr')).toHaveLength(1);
    expect(cards('es')).toHaveLength(1);
  });
});

describe('syncWordDelete', () => {
  beforeEach(clear);
  afterEach(clear);

  function remove(wordKey: string) {
    db.transaction(() => syncWordDelete({ userId: USER, language: 'en', wordKey }))();
  }

  test('deleting one of two rows that fold together keeps the card; deleting the last removes it', () => {
    seedVocab('v1', 'harbor', { createdAt: '2026-01-01T00:00:00Z' });
    seedVocab('v2', 'Harbor', { createdAt: '2026-02-01T00:00:00Z' });
    sync('harbor', 'level2', 'reader');
    db.prepare("UPDATE wordCards SET vocabId = 'v2'").run();

    db.prepare("DELETE FROM vocab WHERE id = 'v2'").run();
    remove('harbor');
    expect(cards()).toHaveLength(1);
    expect(card('harbor')!.vocabId).toBe('v1');
    expect(db.prepare('SELECT 1 FROM knownWords').get()).not.toBeNull();

    db.prepare("DELETE FROM vocab WHERE id = 'v1'").run();
    remove('harbor');
    expect(cards()).toHaveLength(0);
    expect(db.prepare('SELECT 1 FROM knownWords').get()).toBeNull();
  });
});
