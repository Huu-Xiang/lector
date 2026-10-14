import { describe, expect, it } from 'vitest';
import { matchLocale, resolveLocale } from './locales';

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
    expect(matchLocale('en-GB')).toBe('en');
    expect(matchLocale('')).toBeNull();
  });
});
