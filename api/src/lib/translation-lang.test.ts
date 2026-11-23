import '../test-guard';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { db } from '../db';
import { isValidLanguageCode, LANGUAGES } from './languages';
import { guessScript, matchesNative, resolveTranslationLang } from './translation-lang';
import vocabApp from '../routes/vocab';
import dataApp from '../routes/data';

describe('guessScript', () => {
  test.each([
    ['走る', 'ja'],
    ['カタカナ', 'ja'],
    ['사랑', 'ko'],
    ['跑步', 'zh'],
    ['бежать', 'ru'],
    ['يركض', 'ar'],
    ['दौड़ना', 'hi'],
    ['to run', 'latin'],
    ['courir', 'latin'],
    ['苹果 (apple)', 'zh'],
    ['123 !?', null],
    ['', null],
  ])('%s -> %s', (text, expected) => {
    expect(guessScript(text)).toBe(expected as never);
  });
});

describe('matchesNative with a stored code', () => {
  test('requires equality', () => {
    expect(matchesNative('走る', 'ja', 'ja')).toBe(true);
    expect(matchesNative('to run', 'en', 'ja')).toBe(false);
    expect(matchesNative('courir', 'fr', 'en')).toBe(false);
  });
  test('zh-CN and zh-TW are different codes', () => {
    expect(matchesNative('跑步', 'zh-CN', 'zh-CN')).toBe(true);
    expect(matchesNative('跑步', 'zh-CN', 'zh-TW')).toBe(false);
  });
  test('the family label zh matches both variants', () => {
    expect(matchesNative('跑步', 'zh', 'zh-TW')).toBe(true);
    expect(matchesNative('跑步', 'zh', 'ja')).toBe(false);
  });
  test('the stored code wins over the script', () => {
    expect(matchesNative('to run', 'en', 'en')).toBe(true);
    expect(matchesNative('走る', 'ja', 'en')).toBe(false);
  });
});

describe('matchesNative without a stored code', () => {
  test('Latin text matches any Latin-script native language', () => {
    for (const native of ['en', 'fr', 'es', 'de', 'it', 'pt', 'id', 'vi', 'tr']) {
      expect(matchesNative('to run', null, native)).toBe(true);
    }
    expect(matchesNative('to run', null, 'ja')).toBe(false);
    expect(matchesNative('to run', null, 'zh-CN')).toBe(false);
    expect(matchesNative('to run', null, 'ru')).toBe(false);
  });
  test('CJK and other scripts need the native family', () => {
    expect(matchesNative('走る', null, 'ja')).toBe(true);
    expect(matchesNative('走る', null, 'zh-CN')).toBe(false);
    expect(matchesNative('사랑', null, 'ko')).toBe(true);
    expect(matchesNative('사랑', null, 'en')).toBe(false);
    expect(matchesNative('跑步', null, 'zh-TW')).toBe(true);
    expect(matchesNative('跑步', null, 'zh-CN')).toBe(true);
    expect(matchesNative('跑步', null, 'en')).toBe(false);
    expect(matchesNative('бежать', null, 'ru')).toBe(true);
  });
  test('Han-only text also matches Japanese', () => {
    expect(matchesNative('犬', null, 'ja')).toBe(true);
  });
  test('an unknown script counts as a match', () => {
    expect(matchesNative('123', null, 'ja')).toBe(true);
    expect(matchesNative('', undefined, 'ko')).toBe(true);
  });
});

describe('resolveTranslationLang', () => {
  test('keeps a valid claim', () => {
    expect(resolveTranslationLang('to run', 'en', 'ja')).toBe('en');
    expect(resolveTranslationLang('走る', 'ja', 'ja')).toBe('ja');
  });
  test('ignores an invalid claim and guesses', () => {
    expect(resolveTranslationLang('走る', 'xx', 'ja')).toBe('ja');
  });
  test('stores the native code when the guess is compatible', () => {
    expect(resolveTranslationLang('courir', null, 'fr')).toBe('fr');
    expect(resolveTranslationLang('跑步', null, 'zh-TW')).toBe('zh-TW');
  });
  test('stores the guess when it differs from the native language', () => {
    expect(resolveTranslationLang('사랑', null, 'en')).toBe('ko');
    expect(resolveTranslationLang('跑步', null, 'fr')).toBe('zh');
    expect(resolveTranslationLang('to run', null, 'ja')).toBe('en');
  });
  test('stores nothing for empty or unknown text', () => {
    expect(resolveTranslationLang('', 'en', 'en')).toBeNull();
    expect(resolveTranslationLang('123', null, 'en')).toBeNull();
  });

  test('accepts bare target language codes and rejects prototype keys', () => {
    expect(isValidLanguageCode('constructor')).toBe(false);
    expect(isValidLanguageCode('__proto__')).toBe(false);
    expect(isValidLanguageCode('toString')).toBe(false);

    expect(resolveTranslationLang('een klein huis', 'nl', 'zh-CN')).toBe('nl');
    expect(resolveTranslationLang('ett litet hus', 'sv', 'zh-CN')).toBe('sv');
    expect(resolveTranslationLang('一种常见的小动物', 'zh', 'en')).toBe('zh');
    expect(resolveTranslationLang('маленький будинок', 'uk', 'en')).toBe('uk');
    expect(resolveTranslationLang('μικρό σπίτι', 'el', 'en')).toBe('el');
    expect(resolveTranslationLang('λόγος καὶ ἔργον', 'grc', 'en')).toBe('grc');
    expect(resolveTranslationLang('একটি ছোট বাড়ি', 'bn', 'en')).toBe('bn');
    expect(resolveTranslationLang('a house', 'constructor', 'ja')).toBe('en');
    expect(resolveTranslationLang('a house', '__proto__', 'ja')).toBe('en');
  });
});

describe('all 28 target languages script matching (U3 / R7 / R8)', () => {
  test('every language in LANGUAGES validates its own testPhrase via matchesNative', () => {
    for (const [code, config] of Object.entries(LANGUAGES)) {
      expect(matchesNative(config.testPhrase, null, code)).toBe(true);
      expect(matchesNative(config.testPhrase, code, code)).toBe(true);
    }
    expect(guessScript('Привіт')).toBe('ru');
    expect(guessScript('Γεια σου')).toBe('el');
    expect(guessScript('Ἐν ἀρχῇ')).toBe('el');
    expect(guessScript('নমস্কার')).toBe('bn');
  });

  describe('vocab POST and data restore accept monolingual target language codes', () => {
    const clear = () => {
      db.prepare('DELETE FROM wordCards').run();
      db.prepare('DELETE FROM knownWords').run();
      db.prepare('DELETE FROM vocab').run();
    };
    beforeEach(clear);
    afterEach(clear);

    test('POST /api/vocab accepts nl, sv, zh and rejects prototype keys', async () => {
      for (const [id, lang, translation] of [
        ['mono-nl', 'nl', 'een klein gebouw'],
        ['mono-sv', 'sv', 'ett litet hus'],
        ['mono-zh', 'zh', '一种常见的动物'],
      ] as const) {
        const res = await vocabApp.request('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id,
            text: 'woord',
            translation,
            translationLang: lang,
            language: lang,
          }),
        });
        expect(res.status).toBe(200);
        expect(db.prepare('SELECT translationLang FROM vocab WHERE id = ?').get(id)).toEqual({
          translationLang: lang,
        });
      }

      const proto = await vocabApp.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'mono-bad',
          text: 'woord',
          translation: 'bad',
          translationLang: 'constructor',
          language: 'nl',
        }),
      });
      expect(proto.status).toBe(400);

      const exported = await (await dataApp.request('/')).json();
      clear();
      const restored = await dataApp.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exported),
      });
      expect(restored.status).toBe(200);
      expect(
        db
          .prepare("SELECT id, translationLang FROM vocab WHERE id LIKE 'mono-%' ORDER BY id")
          .all(),
      ).toEqual([
        { id: 'mono-nl', translationLang: 'nl' },
        { id: 'mono-sv', translationLang: 'sv' },
        { id: 'mono-zh', translationLang: 'zh' },
      ]);
    });
  });
});
