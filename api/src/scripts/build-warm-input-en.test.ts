import '../test-guard';
import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { buildWarmInput } from './build-warm-input-en';

function fixture(): Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE entries (word TEXT PRIMARY KEY, rank INTEGER);
    CREATE TABLE senses (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT, pos TEXT, gloss TEXT, sort_order INTEGER);
    CREATE TABLE senses_i18n (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT, lang TEXT, pos TEXT, gloss TEXT, sort_order INTEGER);
    CREATE TABLE inflections (inflected_form TEXT, lemma TEXT, type TEXT);
  `);
  const entry = (word: string, rank: number | null, glosses: Array<[string, string]>) => {
    db.run('INSERT INTO entries VALUES (?, ?)', [word, rank]);
    glosses.forEach(([pos, gloss], i) =>
      db.run('INSERT INTO senses (word, pos, gloss, sort_order) VALUES (?,?,?,?)', [
        word,
        pos,
        gloss,
        i,
      ]),
    );
  };
  entry('go', 40, [
    ['verb', 'change location'],
    ['', 'leave'],
  ]);
  entry('quay', 8906, [['noun', 'a wharf']]);
  entry('rare', null, [['adj', 'uncommon']]);
  entry('empty', 5, []);
  db.run(
    "INSERT INTO senses_i18n (word, lang, pos, gloss, sort_order) VALUES ('go','zh-CN','verb','去',0)",
  );
  db.run(
    "INSERT INTO inflections VALUES ('went', 'go', 'past tense'), ('quays', 'quay', 'plural')",
  );
  return db;
}

describe('buildWarmInput', () => {
  test('leaves out covered words and writes one line per sense', () => {
    const { items, stats } = buildWarmInput(fixture(), {
      top: 10,
      libraryWords: [],
      includeCovered: false,
    });
    expect(items).toEqual([{ word: 'quay', senses: ['noun: a wharf'] }]);
    expect(stats).toMatchObject({ topWords: 2, covered: 1, written: 1 });
  });

  test('keeps covered words with the Chinese hint on request', () => {
    const { items } = buildWarmInput(fixture(), {
      top: 10,
      libraryWords: [],
      includeCovered: true,
    });
    expect(items[0]).toEqual({
      word: 'go',
      senses: ['verb: change location', 'leave'],
      zh: ['verb: 去'],
    });
  });

  test('maps library words to headwords, once, and skips unknown tokens', () => {
    const { items, stats } = buildWarmInput(fixture(), {
      top: 0,
      libraryWords: ['quays', 'quay', 'rare', 'zweck', 'empty'],
      includeCovered: false,
    });
    expect(items.map((item) => item.word)).toEqual(['quay', 'rare']);
    expect(stats).toMatchObject({ libraryWords: 2, librarySkipped: 1, union: 2 });
  });
});
