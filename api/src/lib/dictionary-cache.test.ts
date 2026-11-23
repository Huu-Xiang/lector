import '../test-guard';
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import fs from 'fs';
import path from 'path';
import { db } from '../db';
import {
  cacheAcceptedEntry,
  invalidateDictionaryCache,
  lookupWord,
  validateCacheAcceptedInput,
} from './dictionary-db';
import { makeDictionaryRoutes } from '../routes/dictionary';

function reset() {
  db.prepare('DELETE FROM cached_senses').run();
  db.prepare('DELETE FROM cached_related_forms').run();
  db.prepare('DELETE FROM cached_entries').run();
}

describe('cached_entries — tenant, word, and language key', () => {
  beforeEach(reset);
  afterEach(reset);

  test('the same word caches independently per language', () => {
    cacheAcceptedEntry('alice', {
      word: 'die',
      language: 'af',
      senses: [{ partOfSpeech: 'article', gloss: 'the' }],
    });
    cacheAcceptedEntry('alice', {
      word: 'die',
      language: 'de',
      senses: [{ partOfSpeech: 'article', gloss: 'the (feminine)' }],
    });

    // Both rows coexist — the old word-only PK would have collapsed them to one.
    const langs = db
      .prepare(
        "SELECT language FROM cached_entries WHERE userId = 'alice' AND word = 'die' ORDER BY language",
      )
      .all() as { language: string }[];
    expect(langs.map((r) => r.language)).toEqual(['af', 'de']);

    const afGloss = db
      .prepare(
        "SELECT gloss FROM cached_senses WHERE userId = 'alice' AND word = 'die' AND language = 'af'",
      )
      .all() as { gloss: string }[];
    const deGloss = db
      .prepare(
        "SELECT gloss FROM cached_senses WHERE userId = 'alice' AND word = 'die' AND language = 'de'",
      )
      .all() as { gloss: string }[];
    expect(afGloss.map((s) => s.gloss)).toEqual(['the']);
    expect(deGloss.map((s) => s.gloss)).toEqual(['the (feminine)']);
  });

  test('re-caching a word in one language leaves the other language untouched', () => {
    cacheAcceptedEntry('alice', {
      word: 'die',
      language: 'af',
      senses: [{ partOfSpeech: 'article', gloss: 'the' }],
    });
    cacheAcceptedEntry('alice', {
      word: 'die',
      language: 'de',
      senses: [{ partOfSpeech: 'article', gloss: 'the (feminine)' }],
    });

    // Overwrite the 'af' entry; 'de' must be undisturbed.
    cacheAcceptedEntry('alice', {
      word: 'die',
      language: 'af',
      senses: [{ partOfSpeech: 'verb', gloss: 'to die (loanword)' }],
    });

    const af = db
      .prepare(
        "SELECT gloss FROM cached_senses WHERE userId = 'alice' AND word = 'die' AND language = 'af'",
      )
      .all() as { gloss: string }[];
    const de = db
      .prepare(
        "SELECT gloss FROM cached_senses WHERE userId = 'alice' AND word = 'die' AND language = 'de'",
      )
      .all() as { gloss: string }[];
    expect(af.map((s) => s.gloss)).toEqual(['to die (loanword)']); // replaced, not appended
    expect(de.map((s) => s.gloss)).toEqual(['the (feminine)']); // untouched
    expect(
      (
        db
          .prepare(
            "SELECT COUNT(*) AS n FROM cached_entries WHERE userId = 'alice' AND word = 'die'",
          )
          .get() as { n: number }
      ).n,
    ).toBe(2);
  });

  test('two users can cache the same word without reading or replacing each other', () => {
    const word = 'zztenantword';
    cacheAcceptedEntry('alice', {
      word,
      language: 'af',
      senses: [{ partOfSpeech: 'noun', gloss: 'Alice meaning' }],
      relatedForms: [{ form: 'alice-form', relation: 'related' }],
      sourceSentence: 'Alice private sentence',
    });
    cacheAcceptedEntry('bob', {
      word,
      language: 'af',
      senses: [{ partOfSpeech: 'verb', gloss: 'Bob meaning' }],
      relatedForms: [{ form: 'bob-form', relation: 'derived' }],
      sourceSentence: 'Bob private sentence',
    });

    expect(lookupWord('alice', word, 'af')?.senses[0]?.gloss).toBe('Alice meaning');
    expect(lookupWord('bob', word, 'af')?.senses[0]?.gloss).toBe('Bob meaning');
    expect(lookupWord('charlie', word, 'af')).toBeUndefined();

    cacheAcceptedEntry('alice', {
      word,
      language: 'af',
      senses: [{ partOfSpeech: 'noun', gloss: 'Alice replacement' }],
    });
    expect(lookupWord('alice', word, 'af')?.senses[0]?.gloss).toBe('Alice replacement');
    expect(lookupWord('bob', word, 'af')?.senses[0]?.gloss).toBe('Bob meaning');
    const bob = db
      .prepare(
        'SELECT sourceSentence FROM cached_entries WHERE userId = ? AND word = ? AND language = ?',
      )
      .get('bob', word, 'af') as { sourceSentence: string };
    expect(bob.sourceSentence).toBe('Bob private sentence');
  });

  test('a cached English gloss misses after a switch to Russian', () => {
    const userId = 'cache-language-switch';
    const word = 'zzcachelanguageword';
    const setNative = (native: string) =>
      db
        .prepare('INSERT OR REPLACE INTO settings (userId, key, value) VALUES (?, ?, ?)')
        .run(userId, 'nativeLanguage', JSON.stringify(native));
    try {
      setNative('en');
      cacheAcceptedEntry(userId, {
        word,
        language: 'en',
        senses: [{ partOfSpeech: 'noun', gloss: 'tree bark' }],
      });
      expect(lookupWord(userId, word, 'en')?.senses[0]?.gloss).toBe('tree bark');

      setNative('ru');
      expect(lookupWord(userId, word, 'en')).toBeUndefined();
      cacheAcceptedEntry(userId, {
        word,
        language: 'en',
        senses: [{ partOfSpeech: 'noun', gloss: 'кора дерева (tree bark)' }],
      });
      expect(lookupWord(userId, word, 'en')?.senses[0]?.gloss).toBe('кора дерева (tree bark)');

      setNative('en');
      expect(lookupWord(userId, word, 'en')).toBeUndefined();
    } finally {
      db.prepare("DELETE FROM settings WHERE userId = ? AND key = 'nativeLanguage'").run(userId);
    }
  });

  test('validates nested cache bodies before writes', () => {
    expect(
      validateCacheAcceptedInput({
        word: 'test',
        language: 'af',
        senses: [{ partOfSpeech: 'noun', gloss: '' }],
      }).ok,
    ).toBe(false);
    expect(
      validateCacheAcceptedInput({
        word: 'test',
        language: 'af',
        senses: [{ partOfSpeech: 'noun', gloss: 'meaning' }],
        relatedForms: [{ form: 'x', relation: 42 }],
      }).ok,
    ).toBe(false);
  });

  test('monolingual mode skips cached_entries reads/writes and keeps English dict senses unswapped (U3 / R7 / R8)', async () => {
    const userId = 'mono-cache-user';
    const word = 'zzmonobilingual';
    const setSetting = (key: string, value: unknown | null) => {
      db.prepare('DELETE FROM settings WHERE userId = ? AND key = ?').run(userId, key);
      if (value !== null) {
        db.prepare('INSERT INTO settings (userId, key, value) VALUES (?, ?, ?)').run(
          userId,
          key,
          JSON.stringify(value),
        );
      }
    };
    const app = makeDictionaryRoutes(() => userId);

    const fixtureDir = path.resolve('.test-data', 'dict-en-mono-fixture');
    const prevDictDir = process.env.DICT_DIR;
    try {
      setSetting('nativeLanguage', 'zh-CN');
      setSetting('monolingualExplanations', false);

      // Seed bilingual cached_entries row.
      cacheAcceptedEntry(userId, {
        word,
        language: 'fr',
        senses: [{ partOfSpeech: 'noun', gloss: '海绵' }],
      });
      expect(lookupWord(userId, word, 'fr')?.senses[0]?.gloss).toBe('海绵');

      // Enabling monolingual skips cached_entries reads and turns POST /cache into a clean no-op.
      setSetting('monolingualExplanations', true);
      expect(lookupWord(userId, word, 'fr')).toBeUndefined();

      const cacheRes = await app.request('/cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word,
          language: 'fr',
          senses: [{ partOfSpeech: 'noun', gloss: 'matière souple et poreuse' }],
        }),
      });
      expect(cacheRes.status).toBe(200);
      expect(await cacheRes.json()).toEqual({ word, skipped: true });

      // Turning monolingual back OFF immediately restores the intact bilingual cached_entries row.
      setSetting('monolingualExplanations', false);
      expect(lookupWord(userId, word, 'fr')?.senses[0]?.gloss).toBe('海绵');

      // Build a small dictionary-en.db with senses_i18n to verify monolingual skips zh-CN swap.
      fs.mkdirSync(fixtureDir, { recursive: true });
      const file = path.join(fixtureDir, 'dictionary-en.db');
      fs.rmSync(file, { force: true });
      const dictDb = new Database(file);
      dictDb.exec(`
        CREATE TABLE entries (word TEXT PRIMARY KEY, rank INTEGER, ipa TEXT, etymology TEXT);
        CREATE TABLE senses (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT NOT NULL, pos TEXT,
          gloss TEXT NOT NULL, sort_order INTEGER DEFAULT 0);
        CREATE TABLE related_forms (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT NOT NULL,
          related_word TEXT NOT NULL, relation TEXT NOT NULL);
        CREATE TABLE inflections (inflected_form TEXT NOT NULL, lemma TEXT NOT NULL, type TEXT,
          PRIMARY KEY (inflected_form, lemma));
        CREATE TABLE senses_i18n (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT NOT NULL, lang TEXT NOT NULL,
          pos TEXT, gloss TEXT NOT NULL, sort_order INTEGER DEFAULT 0);
        CREATE TABLE examples (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT NOT NULL, sort_order INTEGER DEFAULT 0,
          sentence TEXT NOT NULL, translation TEXT, translation_lang TEXT);
      `);
      dictDb.prepare('INSERT INTO entries (word, rank, ipa) VALUES (?, ?, ?)').run('apple', 500, '/ˈæp.əl/');
      dictDb.prepare('INSERT INTO senses (word, pos, gloss) VALUES (?, ?, ?)').run(
        'apple',
        'noun',
        'a round fruit with red or green skin',
      );
      dictDb.prepare('INSERT INTO senses_i18n (word, lang, pos, gloss) VALUES (?, ?, ?, ?)').run(
        'apple',
        'zh-CN',
        'noun',
        '苹果',
      );
      dictDb
        .prepare(
          'INSERT INTO examples (word, sort_order, sentence, translation, translation_lang) VALUES (?, 0, ?, ?, ?)',
        )
        .run('apple', 'I ate an apple.', '我吃了一个苹果。', 'zh-CN');
      dictDb.close();

      process.env.DICT_DIR = fixtureDir;
      invalidateDictionaryCache('en');

      // Bilingual zh-CN swaps to Chinese senses.
      expect(lookupWord(userId, 'apple', 'en')?.senses[0]?.gloss).toBe('苹果');

      // Monolingual ON returns built-in English senses without senses_i18n swap and needsLocalization falsy.
      setSetting('monolingualExplanations', true);
      const monoEntry = lookupWord(userId, 'apple', 'en')!;
      expect(monoEntry.senses).toEqual([
        { partOfSpeech: 'noun', gloss: 'a round fruit with red or green skin' },
      ]);
      expect(monoEntry.senseLanguage).toBeUndefined();
      expect(monoEntry.examples).toEqual([{ text: 'I ate an apple.' }]);

      const lookupRes = await app.request('/lookup?word=apple&language=en');
      expect(lookupRes.status).toBe(200);
      const lookupBody = (await lookupRes.json()) as {
        entry: { senses: Array<{ gloss: string }>; needsLocalization?: boolean };
      };
      expect(lookupBody.entry.senses[0]?.gloss).toBe('a round fruit with red or green skin');
      expect(lookupBody.entry.needsLocalization).toBeUndefined();
    } finally {
      setSetting('nativeLanguage', null);
      setSetting('monolingualExplanations', null);
      if (prevDictDir === undefined) delete process.env.DICT_DIR;
      else process.env.DICT_DIR = prevDictDir;
      invalidateDictionaryCache('en');
    }
  });
});
