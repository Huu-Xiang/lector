import { describe, expect, it } from 'vitest';
import { nativeLanguageFromLocale } from '@/lib/languages';
import { isUiLocale, matchLocale, resolveLocale } from './locales';

describe('resolveLocale', () => {
  it('prefers a valid cookie over the browser language', () => {
    expect(resolveLocale('zh-CN', 'en-US,en;q=0.9')).toBe('zh-CN');
    expect(resolveLocale('en', 'zh-CN')).toBe('en');
  });

  it('ignores an unknown cookie and reads Accept-Language by quality', () => {
    expect(resolveLocale('xx', 'fr;q=0.4,zh-Hans-CN;q=0.9,en;q=0.8')).toBe('zh-CN');
    expect(resolveLocale(undefined, 'de,fr;q=0.5')).toBe('en');
    expect(resolveLocale(undefined, null)).toBe('en');
  });

  it('maps regional Chinese tags to the listed Chinese locale', () => {
    expect(matchLocale('zh')).toBe('zh-CN');
    expect(matchLocale('zh-SG')).toBe('zh-CN');
    expect(matchLocale('zh-Hans')).toBe('zh-CN');
    expect(matchLocale('zh-CN')).toBe('zh-CN');
    expect(matchLocale('en-GB')).toBe('en');
    expect(matchLocale('ja-JP')).toBe('ja');
    expect(matchLocale('ko-KR')).toBe('ko');
    expect(matchLocale('')).toBeNull();
  });

  it('maps Traditional Chinese tags to zh-TW', () => {
    for (const tag of ['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant-TW', 'zh-Hant']) {
      expect(matchLocale(tag)).toBe('zh-TW');
    }
  });

  it('resolves Accept-Language zh-TW with no cookie to zh-TW', () => {
    expect(resolveLocale(undefined, 'zh-TW,zh;q=0.9,en;q=0.8')).toBe('zh-TW');
    expect(resolveLocale('zh-TW', 'en-US')).toBe('zh-TW');
  });
});

describe('Russian locale', () => {
  it.each(['ru', 'ru-RU', 'ru-KZ'])(
    'maps a %s browser to Russian interface and native language',
    (tag) => {
      const locale = resolveLocale(undefined, `en;q=0.5,${tag};q=0.9`);
      expect(locale).toBe('ru');
      expect(nativeLanguageFromLocale(locale)).toBe('ru');
    },
  );

  it('preserves explicit locale choices', () => {
    expect(isUiLocale('ru')).toBe(true);
    expect(resolveLocale('ru', 'en-US')).toBe('ru');
    expect(resolveLocale('ja', 'ru-RU')).toBe('ja');
    expect(resolveLocale(undefined, 'ru;q=0,en;q=0.5')).toBe('en');
  });
});
