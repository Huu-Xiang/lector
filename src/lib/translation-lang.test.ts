import { describe, expect, test } from 'vitest';
import { guessScript, matchesNative, resolveTranslationLang } from './translation-lang';

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
});
