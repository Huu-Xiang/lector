import { describe, expect, it } from 'vitest';
import { isLanguageReady, parseReadyLanguages } from './ready-languages';

describe('ready languages', () => {
  it('treats an empty setting as every language', () => {
    const ready = parseReadyLanguages('');
    expect(ready).toBeNull();
    expect(isLanguageReady('es', ready)).toBe(true);
  });

  it('limits setup to the listed codes', () => {
    const ready = parseReadyLanguages(' en, fr ,');
    expect(isLanguageReady('en', ready)).toBe(true);
    expect(isLanguageReady('fr', ready)).toBe(true);
    expect(isLanguageReady('es', ready)).toBe(false);
  });
});
