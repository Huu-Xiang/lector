import { describe, expect, it } from 'vitest';
import {
  DEMO_SETS,
  isWordToken,
  lookupWord,
  SENTENCES,
  sentenceText,
  type DemoSetId,
} from './demo-data';

const IDS = Object.keys(DEMO_SETS) as DemoSetId[];

describe('demo data', () => {
  it('has the seven language sets', () => {
    expect(IDS.sort()).toEqual(['en', 'es', 'fr', 'ja', 'ko', 'ru', 'zh']);
  });

  it('rebuilds the sentences from their tokens', () => {
    expect(sentenceText(SENTENCES.en[0].tokens)).toBe('She was tired, so she went to bed early.');
    expect(sentenceText(SENTENCES.en[1].tokens)).toBe(
      'Alice was beginning to get very tired of sitting by her sister on the bank.',
    );
    expect(sentenceText(SENTENCES.fr[0].tokens)).toBe(
      "Elle était fatiguée, alors elle s'est couchée tôt.",
    );
    expect(sentenceText(SENTENCES.fr[1].tokens)).toBe(
      "Marie commençait à se lasser d'attendre son frère sur le quai.",
    );
  });

  it('keeps elisions whole and punctuation out of lookups', () => {
    expect(SENTENCES.fr[0].tokens).toContain("s'est");
    expect(SENTENCES.fr[1].tokens).toContain("d'attendre");
    expect(isWordToken(',')).toBe(false);
    expect(isWordToken("d'attendre")).toBe(true);
  });

  it('points demoIndex at the demo words', () => {
    expect(SENTENCES.en.map((s) => s.tokens[s.demoIndex])).toEqual(['tired', 'bank']);
    expect(SENTENCES.fr.map((s) => s.tokens[s.demoIndex])).toEqual(['fatiguée', 'quai']);
  });

  for (const id of IDS) {
    describe(`set ${id}`, () => {
      const set = DEMO_SETS[id];

      it('explains every word token of both sentences', () => {
        const missing: string[] = [];
        for (const sentence of SENTENCES[set.learn]) {
          for (const token of sentence.tokens.filter(isWordToken)) {
            const entry = lookupWord(set, token);
            if (!entry || !entry.head || !entry.pos || !entry.meaning) missing.push(token);
          }
        }
        expect(missing).toEqual([]);
      });

      it('has a context, a translation and a note for each sentence', () => {
        for (const sentence of set.sentences) {
          expect(sentence.context).not.toBe('');
          expect(sentence.translation).not.toBe('');
          expect(sentence.note.text).not.toBe('');
        }
        expect(set.sentences.map((s) => s.note.kind)).toEqual(['usage', 'idiom']);
      });

      it('labels every part of speech', () => {
        expect(Object.values(set.pos).every((label) => label.length > 0)).toBe(true);
      });
    });
  }

  it('glosses the demo words as written', () => {
    expect(lookupWord(DEMO_SETS.zh, 'tired')?.meaning).toBe('① 累的，疲倦的 ② 厌倦的');
    expect(lookupWord(DEMO_SETS.zh, 'bank')).toMatchObject({ ipa: '/bæŋk/', pos: '名词' });
    expect(lookupWord(DEMO_SETS.en, 'fatiguée')).toMatchObject({
      ipa: '/fa.ti.ɡe/',
      pos: 'adjective',
      meaning: 'tired, worn out',
    });
    expect(lookupWord(DEMO_SETS.en, 'quai')?.meaning).toBe('① quay ② train platform');
  });

  it('looks words up without case', () => {
    expect(lookupWord(DEMO_SETS.es, 'She')?.head).toBe('she');
    expect(lookupWord(DEMO_SETS.es, 'Alice')?.head).toBe('Alice');
  });
});
