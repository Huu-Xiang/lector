import '../test-guard';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import fs from 'fs';
import path from 'path';
import { db as userDb } from '../db';
import { invalidateDictionaryCache, lookupWord } from './dictionary-db';

// English dictionary: ECDICT meanings, exam tags and Tatoeba examples. The real
// dictionary-en.db is a release asset, so the test builds a small one with the
// schema from scripts/build-dictionary-en.py.

const FIXTURE_DIR = path.resolve('.test-data', 'dict-en-fixture');
const previousDictDir = process.env.DICT_DIR;

function setNative(code: string | null) {
  userDb.prepare("DELETE FROM settings WHERE userId = 'local' AND key = 'nativeLanguage'").run();
  if (code) {
    userDb
      .prepare("INSERT INTO settings (userId, key, value) VALUES ('local', 'nativeLanguage', ?)")
      .run(JSON.stringify(code));
  }
}

beforeAll(() => {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  const file = path.join(FIXTURE_DIR, 'dictionary-en.db');
  fs.rmSync(file, { force: true });
  const db = new Database(file);
  db.exec(`
    CREATE TABLE entries (word TEXT PRIMARY KEY, rank INTEGER, ipa TEXT, etymology TEXT);
    CREATE TABLE senses (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT NOT NULL, pos TEXT,
      gloss TEXT NOT NULL, sort_order INTEGER DEFAULT 0);
    CREATE TABLE related_forms (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT NOT NULL,
      related_word TEXT NOT NULL, relation TEXT NOT NULL);
    CREATE TABLE inflections (inflected_form TEXT NOT NULL, lemma TEXT NOT NULL, type TEXT,
      PRIMARY KEY (inflected_form, lemma));
    CREATE TABLE entry_meta (word TEXT PRIMARY KEY, collins INTEGER, oxford INTEGER, tags TEXT,
      bnc INTEGER, frq INTEGER);
    CREATE TABLE senses_i18n (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT NOT NULL, lang TEXT NOT NULL,
      pos TEXT, gloss TEXT NOT NULL, sort_order INTEGER DEFAULT 0);
    CREATE TABLE examples (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT NOT NULL, sort_order INTEGER DEFAULT 0,
      sentence TEXT NOT NULL, translation TEXT, translation_lang TEXT);
  `);
  db.prepare('INSERT INTO entries (word, rank, ipa) VALUES (?, ?, ?)').run('go', 40, '/ɡəu/');
  db.prepare('INSERT INTO entries (word, rank, ipa) VALUES (?, ?, ?)').run('quay', 8906, '/kiː/');
  db.prepare('INSERT INTO senses (word, pos, gloss) VALUES (?, ?, ?)').run(
    'go',
    'verb',
    'change location',
  );
  db.prepare('INSERT INTO senses_i18n (word, lang, pos, gloss) VALUES (?, ?, ?, ?)').run(
    'go',
    'zh-CN',
    'verb',
    '去，走',
  );
  db.prepare('INSERT INTO entry_meta (word, collins, oxford, tags) VALUES (?, ?, ?, ?)').run(
    'go',
    5,
    1,
    'zk gk',
  );
  db.prepare(
    'INSERT INTO examples (word, sort_order, sentence, translation, translation_lang) VALUES (?, 0, ?, ?, ?)',
  ).run('go', 'I have to go to sleep.', '我该去睡觉了。', 'zh-CN');
  db.prepare('INSERT INTO examples (word, sort_order, sentence) VALUES (?, 1, ?)').run(
    'go',
    'Let us go home.',
  );
  db.prepare('INSERT INTO senses (word, pos, gloss) VALUES (?, ?, ?)').run(
    'quay',
    'noun',
    'a wharf',
  );
  db.prepare('INSERT INTO inflections (inflected_form, lemma, type) VALUES (?, ?, ?)').run(
    'went',
    'go',
    'past tense',
  );
  db.close();
  process.env.DICT_DIR = FIXTURE_DIR;
  invalidateDictionaryCache('en');
});

afterEach(() => setNative(null));

afterAll(() => {
  if (previousDictDir === undefined) delete process.env.DICT_DIR;
  else process.env.DICT_DIR = previousDictDir;
  invalidateDictionaryCache('en');
});

describe('English dictionary lookup', () => {
  test('an English reader gets English meanings, tags and examples without translations', () => {
    setNative('en');
    const entry = lookupWord('local', 'go', 'en')!;
    expect(entry.senses).toEqual([{ partOfSpeech: 'verb', gloss: 'change location' }]);
    expect(entry.senseLanguage).toBeUndefined();
    expect(entry.tags).toEqual(['zk', 'gk']);
    expect(entry.collins).toBe(5);
    expect(entry.oxford).toBe(true);
    expect(entry.examples).toEqual([
      { text: 'I have to go to sleep.' },
      { text: 'Let us go home.' },
    ]);
  });

  test('a Chinese reader gets Chinese meanings, the English ones beside them, and translated examples', () => {
    setNative('zh-CN');
    const entry = lookupWord('local', 'go', 'en')!;
    expect(entry.senses).toEqual([{ partOfSpeech: 'verb', gloss: '去，走' }]);
    expect(entry.senseLanguage).toBe('zh-CN');
    expect(entry.englishSenses).toEqual([{ partOfSpeech: 'verb', gloss: 'change location' }]);
    expect(entry.examples![0]).toEqual({
      text: 'I have to go to sleep.',
      translation: '我该去睡觉了。',
    });
    expect(entry.examples![1]).toEqual({ text: 'Let us go home.' });
  });

  test('a word without Chinese rows keeps its English meanings', () => {
    setNative('zh-CN');
    const entry = lookupWord('local', 'quay', 'en')!;
    expect(entry.senses).toEqual([{ partOfSpeech: 'noun', gloss: 'a wharf' }]);
    expect(entry.senseLanguage).toBeUndefined();
    expect(entry.tags).toBeUndefined();
  });

  test('an inflected form shows the base word with its extras', () => {
    setNative('zh-CN');
    const entry = lookupWord('local', 'went', 'en')!;
    expect(entry.lemmaInfo).toEqual({ stem: 'go', label: 'past tense form of' });
    expect(entry.senses[0].gloss).toBe('去，走');
    expect(entry.examples).toHaveLength(2);
  });
});
