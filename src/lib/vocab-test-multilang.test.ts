import { describe, expect, it } from 'vitest';
import { nextItem, prepareNext, recommendBooks, type Answer } from './vocab-test';
import {
  VOCAB_TEST_LANGUAGES,
  isVocabTestLanguage,
  loadVocabTestBooks,
  loadVocabTestData,
} from './vocab-test-data';
import { readVocabResult, writeVocabResult } from './vocab-result';
import { addSeenWord, readSeenWords } from './vocab-seen';

describe('multi-language vocab test data and storage', () => {
  it('supports en, fr, and es target languages', () => {
    expect(VOCAB_TEST_LANGUAGES).toEqual(['en', 'fr', 'es']);
    expect(isVocabTestLanguage('fr')).toBe(true);
    expect(isVocabTestLanguage('es')).toBe(true);
    expect(isVocabTestLanguage('de')).toBe(false);
  });

  for (const lang of ['fr', 'es'] as const) {
    it(`loads valid ${lang} word pool and runs 60 non-repeating adaptive questions`, () => {
      const data = loadVocabTestData(undefined, lang);
      expect(data).not.toBeNull();
      expect(data!.answerLanguage).toBe('en');
      expect(data!.bands.length).toBe(16);
      expect(data!.bands[data!.bands.length - 1]?.to).toBe(40000);

      for (const band of data!.bands) {
        for (const word of band.words) {
          for (const sense of word.s) {
            expect(sense.en).not.toContain('(');
            expect(sense.en).not.toContain(')');
            expect(sense.en.toLowerCase()).not.toContain('combined with');
            expect(sense.en.toLowerCase()).not.toContain('infinitive of ');
          }
        }
      }

      const top50 = new Set(data!.bands[0]!.words.filter((w) => w.r <= 50).map((w) => w.w));
      if (lang === 'fr') {
        expect(top50.has('commer')).toBe(false);
        expect(top50.has('éyoù')).toBe(false);
      } else {
        expect(top50.has('parar')).toBe(false);
        expect(top50.has('nadar')).toBe(false);
      }

      const answers: Answer[] = [];
      const seen = new Set<string>();
      let item = nextItem(answers, data!, 42, seen);
      for (let i = 0; i < 60 && item; i++) {
        expect(seen.has(item.word)).toBe(false);
        expect(item.meanings).toHaveLength(3);
        expect(item.senses.every((s) => s.en.trim().length > 0)).toBe(true);
        seen.add(item.word);
        const prepared = prepareNext(answers, item, data!, 42, seen);
        const right = i % 2 === 0;
        answers.push({ item, choice: right ? item.answer : null });
        item = right ? prepared.right : prepared.notRight;
      }
      expect(answers).toHaveLength(60);
    });

    it(`loads ${lang} book coverage and recommends readable ${lang} books`, () => {
      const books = loadVocabTestBooks(lang);
      expect(books.length).toBeGreaterThanOrEqual(20);
      expect(books.every((b) => Array.isArray(b.cov) && b.cov.length === 14)).toBe(true);
      const picks = recommendBooks(books, 4000, 'B2');
      expect(picks.length).toBeGreaterThan(0);
    });
  }

  it('isolates browser vocab results and seen words per target language', () => {
    const store = new Map<string, string>();
    const orig = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
      },
    });
    try {
      writeVocabResult(5000, 'B2', 1000, 'en');
      writeVocabResult(2200, 'A2', 1000, 'fr');
      expect(readVocabResult(2000, 'en')?.estimate).toBe(5000);
      expect(readVocabResult(2000, 'fr')?.estimate).toBe(2200);
      expect(readVocabResult(2000, 'es')).toBeNull();

      addSeenWord('apple', 'en');
      addSeenWord('pomme', 'fr');
      expect(readSeenWords('en')).toEqual(['apple']);
      expect(readSeenWords('fr')).toEqual(['pomme']);
      expect(readSeenWords('es')).toEqual([]);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: orig });
    }
  });
});
