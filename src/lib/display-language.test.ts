import { describe, expect, it } from 'vitest';
import { displayLanguage } from './display-language';

describe('displayLanguage', () => {
  it('follows the interface when the translation language has an interface', () => {
    expect(displayLanguage('en', 'zh-CN')).toBe('zh-CN');
    expect(displayLanguage('zh-CN', 'en')).toBe('en');
    expect(displayLanguage('en', 'en')).toBe('en');
  });

  it('keeps a translation language the interface does not offer', () => {
    expect(displayLanguage('ja', 'ko')).toBe('ko');
    expect(displayLanguage('zh-TW', 'zh-CN')).toBe('zh-TW');
    expect(displayLanguage('de', 'ja')).toBe('de');
  });
});
