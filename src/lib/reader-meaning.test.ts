import { describe, expect, it, vi } from 'vitest';
import {
  dictionaryMeaningLang,
  expectedMeaningLanguage,
  savedMeaningFits,
  shouldAutoReplaceSavedMeaning,
  shouldUseMonolingualAiGloss,
} from './reader-meaning';

import { LANGUAGES } from './languages';

const apiFetch = vi.fn();
vi.mock('./api-base', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  hasAiRequestGuard: () => false,
}));
vi.mock('./data-layer', () => ({
  getActiveLanguage: () => 'fr',
  getActivePack: () => LANGUAGES.fr,
}));

import {
  invalidateLookupCache,
  localizeEntrySenses,
  prefetchLocalizedSenses,
} from './dictionary-client';

describe('savedMeaningFits', () => {
  it('rejects a missing or blank meaning', () => {
    expect(savedMeaningFits(undefined, 'ja')).toBe(false);
    expect(savedMeaningFits({ translation: '  ' }, 'ja')).toBe(false);
  });
  it('trusts the stored language', () => {
    expect(savedMeaningFits({ translation: 'dog', translationLang: 'en' }, 'ja')).toBe(false);
    expect(savedMeaningFits({ translation: '犬', translationLang: 'ja' }, 'ja')).toBe(true);
    expect(savedMeaningFits({ translation: 'un animal', translationLang: 'fr' }, 'fr')).toBe(true);
    expect(savedMeaningFits({ translation: '猫', translationLang: 'zh-CN' }, 'fr')).toBe(false);
  });
  it('guesses from the script when no language is stored', () => {
    expect(savedMeaningFits({ translation: 'dog', translationLang: null }, 'ja')).toBe(false);
    expect(savedMeaningFits({ translation: 'dog', translationLang: null }, 'fr')).toBe(true);
    expect(savedMeaningFits({ translation: '犬だ' }, 'ja')).toBe(true);
    expect(savedMeaningFits({ translation: 'een klein huis', translationLang: null }, 'nl')).toBe(
      true,
    );
    expect(savedMeaningFits({ translation: 'кіт', translationLang: null }, 'uk')).toBe(true);
    expect(savedMeaningFits({ translation: 'γάτα', translationLang: null }, 'el')).toBe(true);
    expect(savedMeaningFits({ translation: 'বিড়াল', translationLang: null }, 'bn')).toBe(true);
  });
});

describe('dictionaryMeaningLang', () => {
  it('marks failed localization as English', () => {
    expect(dictionaryMeaningLang(true, false, 'ja')).toBe('en');
  });
  it('uses the native language otherwise', () => {
    expect(dictionaryMeaningLang(true, true, 'ja')).toBe('ja');
    expect(dictionaryMeaningLang(false, false, 'ja')).toBe('ja');
    expect(dictionaryMeaningLang(false, false, 'en')).toBe('en');
  });
});

describe('monolingual reader helpers (U3 / R7 / R8)', () => {
  it('resolves expectedMeaningLanguage and routes non-English monolingual lookups to AI gloss', () => {
    expect(expectedMeaningLanguage('fr', 'zh-CN', false)).toBe('zh-CN');
    expect(expectedMeaningLanguage('fr', 'zh-CN', true)).toBe('fr');
    expect(expectedMeaningLanguage('en', 'zh-CN', true)).toBe('en');

    expect(shouldUseMonolingualAiGloss('fr', true)).toBe(true);
    expect(shouldUseMonolingualAiGloss('en', true)).toBe(false);
    expect(shouldUseMonolingualAiGloss('fr', false)).toBe(false);
  });

  it('never auto-replaces saved bilingual or monolingual meanings across mode switches', () => {
    // Stale English fallback on a French card in bilingual zh-CN mode can still be repaired.
    expect(
      shouldAutoReplaceSavedMeaning(
        { translation: 'cat', translationLang: 'en', translationSource: 'dictionary' },
        'fr',
        'zh-CN',
        false,
      ),
    ).toBe(true);
    // Monolingual French card is protected even when bilingual mode is active.
    expect(
      shouldAutoReplaceSavedMeaning(
        { translation: 'petit félin', translationLang: 'fr', translationSource: 'ai_retranslate' },
        'fr',
        'zh-CN',
        false,
      ),
    ).toBe(false);
    // Bilingual zh-CN card is protected when monolingual mode is enabled.
    expect(
      shouldAutoReplaceSavedMeaning(
        { translation: '猫', translationLang: 'zh-CN', translationSource: 'dictionary' },
        'fr',
        'zh-CN',
        true,
      ),
    ).toBe(false);
  });

  it('invalidateLookupCache clears prefetched and in-flight localization caches too', async () => {
    apiFetch.mockReset();
    apiFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ senses: { chat: [{ partOfSpeech: 'noun', gloss: '猫' }] } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ senses: null }), { status: 200 }));

    await prefetchLocalizedSenses(['chat'], 'zh-CN');
    expect(await localizeEntrySenses('chat', 'zh-CN')).toEqual([
      { partOfSpeech: 'noun', gloss: '猫' },
    ]);
    expect(apiFetch).toHaveBeenCalledTimes(1);

    // Clearing the lookup cache must drop prefetched senses so subsequent lookups re-fetch.
    invalidateLookupCache();
    expect(await localizeEntrySenses('chat', 'zh-CN')).toBeNull();
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});
