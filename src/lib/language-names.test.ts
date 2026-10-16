import { describe, expect, it } from 'vitest';
import { languageDisplayName } from './language-names';

describe('languageDisplayName', () => {
  it('names Koine Greek in Chinese and English', () => {
    expect(languageDisplayName('grc', 'zh-CN', 'Koine Greek')).toContain('希腊语');
    expect(languageDisplayName('grc', 'en', 'Koine Greek')).toBe('Ancient Greek (Koine)');
  });

  it('uses the locale name when the runtime has one, else the English name', () => {
    expect(languageDisplayName('fr', 'zh-CN', 'French')).toBe('法语');
    expect(languageDisplayName('fr', 'en', 'French')).toBe('French');
  });
});
