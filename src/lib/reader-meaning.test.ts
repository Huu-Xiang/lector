import { describe, expect, it } from 'vitest';
import { dictionaryMeaningLang, savedMeaningFits } from './reader-meaning';

describe('savedMeaningFits', () => {
  it('rejects a missing or blank meaning', () => {
    expect(savedMeaningFits(undefined, 'ja')).toBe(false);
    expect(savedMeaningFits({ translation: '  ' }, 'ja')).toBe(false);
  });
  it('trusts the stored language', () => {
    expect(savedMeaningFits({ translation: 'dog', translationLang: 'en' }, 'ja')).toBe(false);
    expect(savedMeaningFits({ translation: '犬', translationLang: 'ja' }, 'ja')).toBe(true);
  });
  it('guesses from the script when no language is stored', () => {
    expect(savedMeaningFits({ translation: 'dog', translationLang: null }, 'ja')).toBe(false);
    expect(savedMeaningFits({ translation: 'dog', translationLang: null }, 'fr')).toBe(true);
    expect(savedMeaningFits({ translation: '犬だ' }, 'ja')).toBe(true);
  });
});

describe('dictionaryMeaningLang', () => {
  it('marks failed localization as English', () => {
    expect(dictionaryMeaningLang(true, false, 'ja')).toBe('en');
  });
  it('uses the native language otherwise', () => {
    expect(dictionaryMeaningLang(true, true, 'ja')).toBe('ja');
    expect(dictionaryMeaningLang(false, false, 'ja')).toBe('ja');
  });
});
