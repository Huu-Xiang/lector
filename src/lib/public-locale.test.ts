import { describe, expect, it } from 'vitest';
import { isAuthRoute } from './api-base';
import {
  PUBLIC_LOCALE_PREFIXES,
  buildPublicAlternates,
  isPublicSeoPath,
  localizePublicPath,
  parsePublicLocalePath,
  stripPublicLocalePrefix,
} from './public-locale';

describe('public-locale', () => {
  it('maps the 5 non-English UI locales to lowercase URL prefixes', () => {
    expect(PUBLIC_LOCALE_PREFIXES).toEqual({
      'zh-cn': 'zh-CN',
      'zh-tw': 'zh-TW',
      ja: 'ja',
      ko: 'ko',
      ru: 'ru',
    });
  });

  it('parses valid localized public SEO paths and rejects non-public or unknown paths', () => {
    expect(parsePublicLocalePath('/zh-cn')).toEqual({
      prefix: '/zh-cn',
      locale: 'zh-CN',
      publicPath: '/',
      rewritePath: '/landing',
    });
    expect(parsePublicLocalePath('/zh-cn/vocab-test')).toEqual({
      prefix: '/zh-cn',
      locale: 'zh-CN',
      publicPath: '/vocab-test',
      rewritePath: '/vocab-test',
    });
    expect(parsePublicLocalePath('/ja/books/fr/level/b1')).toEqual({
      prefix: '/ja',
      locale: 'ja',
      publicPath: '/books/fr/level/b1',
      rewritePath: '/books/fr/level/b1',
    });
    expect(parsePublicLocalePath('/ru/alternatives/lingq')).toEqual({
      prefix: '/ru',
      locale: 'ru',
      publicPath: '/alternatives/lingq',
      rewritePath: '/alternatives/lingq',
    });
    expect(parsePublicLocalePath('/zh-cn/practice')).toBeNull();
    expect(parsePublicLocalePath('/zh-cn/vocab-test/history')).toBeNull();
    expect(parsePublicLocalePath('/zh-cn/api/books')).toBeNull();
    expect(parsePublicLocalePath('/xx/books')).toBeNull();
    expect(parsePublicLocalePath('/books')).toBeNull();
  });

  it('strips public locale prefixes cleanly', () => {
    expect(stripPublicLocalePrefix('/zh-cn')).toBe('/');
    expect(stripPublicLocalePrefix('/zh-tw/books/en')).toBe('/books/en');
    expect(stripPublicLocalePrefix('/ja/vocab-test')).toBe('/vocab-test');
    expect(stripPublicLocalePrefix('/zh-cn/practice')).toBe('/zh-cn/practice');
    expect(stripPublicLocalePrefix('/books/en')).toBe('/books/en');
  });

  it('localizes public paths for switching interface language', () => {
    expect(localizePublicPath('/vocab-test', 'zh-CN')).toBe('/zh-cn/vocab-test');
    expect(localizePublicPath('/zh-cn/vocab-test', 'en')).toBe('/vocab-test');
    expect(localizePublicPath('/zh-cn/vocab-test', 'ja')).toBe('/ja/vocab-test');
    expect(localizePublicPath('/', 'ko')).toBe('/ko');
    expect(localizePublicPath('/ko', 'en')).toBe('/');
    expect(isPublicSeoPath('/alternatives/lingq')).toBe(true);
    expect(isPublicSeoPath('/vocab-test/fr')).toBe(true);
    expect(isPublicSeoPath('/vocab-test/history')).toBe(false);
    expect(isPublicSeoPath('/practice')).toBe(false);
  });

  it('builds self-referencing canonical and all 7 hreflang alternates', () => {
    const zh = buildPublicAlternates('/vocab-test', '/zh-cn');
    expect(zh.canonical).toBe('https://readfox.app/zh-cn/vocab-test');
    expect(zh.languages).toEqual({
      en: 'https://readfox.app/vocab-test',
      'zh-CN': 'https://readfox.app/zh-cn/vocab-test',
      'zh-TW': 'https://readfox.app/zh-tw/vocab-test',
      ja: 'https://readfox.app/ja/vocab-test',
      ko: 'https://readfox.app/ko/vocab-test',
      ru: 'https://readfox.app/ru/vocab-test',
      'x-default': 'https://readfox.app/vocab-test',
    });

    const homeEn = buildPublicAlternates('/', '');
    expect(homeEn.canonical).toBe('https://readfox.app/');
    expect(homeEn.languages?.['zh-CN']).toBe('https://readfox.app/zh-cn');
  });

  it('treats localized public routes as auth-exempt in isAuthRoute', () => {
    expect(isAuthRoute('/zh-cn')).toBe(true);
    expect(isAuthRoute('/ja/books/fr/level/b1')).toBe(true);
    expect(isAuthRoute('/ru/alternatives/lingq')).toBe(true);
    expect(isAuthRoute('/ko/vocab-test')).toBe(true);
    expect(isAuthRoute('/zh-cn/practice')).toBe(false);
  });
});
