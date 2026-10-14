import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NATIVE_LANGUAGE,
  isNativeLanguageCode,
  nativeLanguageFromLocale,
  nativeLanguageName,
} from './native';

describe('native languages', () => {
  it('maps browser locales to a supported native language', () => {
    expect(nativeLanguageFromLocale('zh-CN')).toBe('zh-CN');
    expect(nativeLanguageFromLocale('zh-Hans-CN')).toBe('zh-CN');
    expect(nativeLanguageFromLocale('zh-TW')).toBe('zh-TW');
    expect(nativeLanguageFromLocale('zh-Hant')).toBe('zh-TW');
    expect(nativeLanguageFromLocale('es-MX')).toBe('es');
    expect(nativeLanguageFromLocale('sw-KE')).toBe(DEFAULT_NATIVE_LANGUAGE);
    expect(nativeLanguageFromLocale(undefined)).toBe(DEFAULT_NATIVE_LANGUAGE);
  });

  it('names a language for prompts and falls back to English', () => {
    expect(nativeLanguageName('zh-CN')).toBe('Simplified Chinese');
    expect(nativeLanguageName('nope')).toBe('English');
    expect(nativeLanguageName(null)).toBe('English');
  });

  it('only accepts listed codes', () => {
    expect(isNativeLanguageCode('ja')).toBe(true);
    expect(isNativeLanguageCode('xx')).toBe(false);
    expect(isNativeLanguageCode(42)).toBe(false);
  });
});
