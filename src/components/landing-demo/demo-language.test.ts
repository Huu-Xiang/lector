import { describe, expect, it } from 'vitest';
import { demoSetFor, demoSetForRequest } from './demo-language';

describe('demoSetFor', () => {
  it.each([
    [['zh-CN'], 'zh'],
    [['zh-Hant-TW'], 'zh'],
    [['ja'], 'ja'],
    [['ko-KR'], 'ko'],
    [['ru'], 'ru'],
    [['es-MX'], 'es'],
    [['fr-CA'], 'fr'],
    [['en-GB'], 'en'],
    [['de-DE'], 'en'],
    [['pt', 'ru'], 'en'],
    [['ZH_cn'], 'zh'],
    [[], 'en'],
    [undefined, 'en'],
  ] as const)('%j gives %s', (tags, expected) => {
    expect(demoSetFor(tags)).toBe(expected);
  });
});

describe('demoSetForRequest', () => {
  it('prefers the interface locale cookie', () => {
    expect(demoSetForRequest('ja', 'ru,en;q=0.5')).toEqual({ id: 'ja', fromCookie: true });
    expect(demoSetForRequest('en', 'zh-CN')).toEqual({ id: 'en', fromCookie: true });
    expect(demoSetForRequest('ru', 'es')).toEqual({ id: 'ru', fromCookie: true });
  });

  it('ignores a cookie that is not an interface locale', () => {
    expect(demoSetForRequest('fr', 'es')).toEqual({ id: 'es', fromCookie: false });
  });

  it('reads Accept-Language in q order', () => {
    expect(demoSetForRequest(undefined, 'en;q=0.4, fr;q=0.9')).toEqual({
      id: 'fr',
      fromCookie: false,
    });
  });

  it('falls back to French learning for no signal', () => {
    expect(demoSetForRequest(undefined, null)).toEqual({ id: 'en', fromCookie: false });
  });
});
