import { describe, expect, it } from 'vitest';
import { displayLanguage, translationFor } from './display-language';

describe('displayLanguage', () => {
  it('follows the interface when the translation language has an interface', () => {
    expect(displayLanguage('en', 'zh-CN')).toBe('zh-CN');
    expect(displayLanguage('zh-CN', 'en')).toBe('en');
    expect(displayLanguage('zh-TW', 'zh-CN')).toBe('zh-CN');
    expect(displayLanguage('en', 'zh-TW')).toBe('zh-TW');
    expect(displayLanguage('en', 'en')).toBe('en');
  });

  it('keeps a translation language the interface does not offer', () => {
    expect(displayLanguage('ja', 'ko')).toBe('ko');
    expect(displayLanguage('de', 'zh-TW')).toBe('de');
    expect(displayLanguage('de', 'ja')).toBe('de');
  });
});

describe('translationFor', () => {
  it('uses the Traditional text when it exists', () => {
    expect(translationFor({ 'zh-CN': '黑骏马', 'zh-TW': '黑駿馬' }, 'zh-TW')).toBe('黑駿馬');
  });

  it('falls back to Simplified when Traditional text is missing', () => {
    expect(translationFor({ 'zh-CN': '黑骏马', fr: 'Black Beauty' }, 'zh-TW')).toBe('黑骏马');
  });

  it('does not borrow Simplified for other languages', () => {
    expect(translationFor({ 'zh-CN': '黑骏马' }, 'fr')).toBeUndefined();
    expect(translationFor({ 'zh-CN': '黑骏马' }, 'zh-CN')).toBe('黑骏马');
  });
});
