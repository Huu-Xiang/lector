import '../test-guard';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { db } from '../db';
import app from './known-words';

const INTRUDER = 'known-words-route-intruder';

function reset() {
  db.prepare("DELETE FROM knownWords WHERE userId IN ('local', ?)").run(INTRUDER);
  db.prepare("DELETE FROM settings WHERE userId = 'local' AND key = 'targetLanguage'").run();
}

function post(body: unknown) {
  return app.request('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('known-words route', () => {
  beforeEach(reset);
  afterEach(reset);

  test('GET returns only the requested language and current tenant', async () => {
    const insert = db.prepare(
      'INSERT INTO knownWords (userId, word, language, state) VALUES (?, ?, ?, ?)',
    );
    insert.run('local', 'huis', 'af', 'known');
    insert.run('local', 'haus', 'de', 'level2');
    insert.run(INTRUDER, 'geheim', 'af', 'ignored');

    expect(await (await app.request('/?language=af')).json()).toEqual({ huis: 'known' });
    expect(await (await app.request('/?language=de')).json()).toEqual({ haus: 'level2' });
  });

  test('POST folds duplicate keys, applies the final state, and cannot overwrite another tenant', async () => {
    db.prepare(
      "INSERT INTO knownWords (userId, word, language, state) VALUES (?, 'huis', 'af', 'ignored')",
    ).run(INTRUDER);

    const response = await post({
      language: 'af',
      updates: [
        { word: 'HUIS', state: 'level1' },
        { word: 'huis', state: 'known' },
      ],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, count: 2 });
    expect(
      db
        .prepare(
          "SELECT userId, word, language, state FROM knownWords WHERE word = 'huis' ORDER BY userId",
        )
        .all(),
    ).toEqual([
      { userId: INTRUDER, word: 'huis', language: 'af', state: 'ignored' },
      { userId: 'local', word: 'huis', language: 'af', state: 'known' },
    ]);
  });

  test('omitted language resolves from the current user setting', async () => {
    db.prepare('INSERT INTO settings (userId, key, value) VALUES (?, ?, ?)').run(
      'local',
      'targetLanguage',
      '"de"',
    );

    const response = await post({ updates: [{ word: 'HAUS', state: 'known' }] });

    expect(response.status).toBe(200);
    expect(
      db.prepare("SELECT word, language, state FROM knownWords WHERE userId = 'local'").get(),
    ).toEqual({ word: 'haus', language: 'de', state: 'known' });
  });

  test.each([
    ['a missing updates array', {}],
    ['a non-array updates value', { updates: 'all' }],
    ['a non-string word', { updates: [{ word: 42, state: 'known' }] }],
    ['an invalid state', { updates: [{ word: 'huis', state: 'mastered' }] }],
    ['an unsupported language', { language: 'xx', updates: [] }],
  ])('rejects %s without writing', async (_label, body) => {
    const response = await post(body);

    expect(response.status).toBe(400);
    expect(db.prepare("SELECT COUNT(*) AS n FROM knownWords WHERE userId = 'local'").get()).toEqual(
      { n: 0 },
    );
  });
});

describe('known-words route and word cards', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM wordCards').run();
    db.prepare('DELETE FROM vocab').run();
    reset();
  });
  afterEach(() => {
    db.prepare('DELETE FROM wordCards').run();
    db.prepare('DELETE FROM vocab').run();
    reset();
  });

  test('a bulk import retires the card of a known word and creates no card for a stray word', async () => {
    db.prepare(
      `INSERT INTO vocab (id, text, type, sentence, translation, state, stateUpdatedAt, createdAt, language)
       VALUES ('v1', 'harbor', 'word', 's', 't', 'level2', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'en')`,
    ).run();
    db.prepare(
      `INSERT INTO wordCards (userId, id, language, wordKey, vocabId, type, state, due, modelVersion, configVersion, createdAt, updatedAt)
       VALUES ('local', 'c1', 'en', 'harbor', 'v1', 'word', 'new', '2026-01-01T00:00:00Z', 'FSRS-6', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
    ).run();

    const response = await post({
      language: 'en',
      updates: [
        { word: 'Harbor', state: 'known' },
        { word: 'stray', state: 'level2' },
      ],
    });

    expect(response.status).toBe(200);
    expect(
      db.prepare("SELECT retiredAt IS NOT NULL AS retired FROM wordCards WHERE id = 'c1'").get(),
    ).toEqual({ retired: 1 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM wordCards').get()).toEqual({ n: 1 });
  });
});
