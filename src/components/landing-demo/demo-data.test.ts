import { describe, expect, it } from 'vitest';
import { PHRASE_SPANS } from './demo-phrases';
import {
  DEMO_SETS,
  isWordToken,
  lookupWord,
  phraseTranslation,
  resolveSpan,
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

describe('phrases', () => {
  const learns = ['en', 'fr'] as const;

  for (const learn of learns) {
    for (const sentence of [0, 1]) {
      const { tokens } = SENTENCES[learn][sentence];
      const spans = PHRASE_SPANS[learn][sentence];
      const words = tokens.map((token, i) => (isWordToken(token) ? i : -1)).filter((i) => i >= 0);

      describe(`${learn} sentence ${sentence + 1}`, () => {
        it('declares each range once, with the text of its tokens', () => {
          for (const span of spans) {
            expect(sentenceText(tokens.slice(span.from, span.to + 1))).toBe(span.text);
            expect(span.to).toBeGreaterThan(span.from);
          }
          expect(new Set(spans.map((span) => `${span.from}-${span.to}`)).size).toBe(spans.length);
          expect(new Set(spans.map((span) => span.text)).size).toBe(spans.length);
        });

        it('resolves every span of two or more tokens to a phrase or the whole sentence', () => {
          for (let from = 0; from < tokens.length; from++) {
            for (let to = from + 1; to < tokens.length; to++) {
              const selected = words.filter((i) => i >= from && i <= to);
              const result = resolveSpan(learn, sentence, from, to);
              const label = `${from}-${to}`;
              expect(result.from, label).toBeLessThanOrEqual(selected[0]);
              expect(result.to, label).toBeGreaterThanOrEqual(selected[selected.length - 1]);
              if (result.kind === 'sentence') {
                expect([result.from, result.to], label).toEqual([
                  words[0],
                  words[words.length - 1],
                ]);
              } else {
                expect(
                  spans.map((s) => s.text),
                  label,
                ).toContain(result.text);
                expect(selected.length, label).toBeLessThan(words.length);
              }
            }
          }
        });

        it('picks the smallest phrase that holds the words', () => {
          for (const span of spans) {
            const result = resolveSpan(learn, sentence, span.from, span.to);
            expect(result).toMatchObject({ kind: 'phrase', from: span.from, to: span.to });
          }
        });
      });
    }
  }

  for (const id of IDS) {
    it(`set ${id} translates every phrase of its language and nothing else`, () => {
      const set = DEMO_SETS[id];
      for (const sentence of [0, 1]) {
        const expected = PHRASE_SPANS[set.learn][sentence].map((span) => span.text).sort();
        expect(Object.keys(set.phrases[sentence]).sort()).toEqual(expected);
        expect(Object.values(set.phrases[sentence]).every((text) => text.trim() !== '')).toBe(true);
      }
    });
  }

  it('counts the phrases', () => {
    expect(PHRASE_SPANS.en.map((spans) => spans.length)).toEqual([13, 33]);
    expect(PHRASE_SPANS.fr.map((spans) => spans.length)).toEqual([12, 24]);
  });

  it('shows only the phrase for "Marie commençait"', () => {
    expect(resolveSpan('fr', 1, 0, 1)).toMatchObject({ kind: 'phrase', from: 0, to: 1 });
    expect(phraseTranslation(DEMO_SETS.en, 1, 0, 1)).toEqual({
      text: 'Marie commençait',
      translation: 'Marie was beginning',
    });
    expect(phraseTranslation(DEMO_SETS.en, 1, 3, 5).translation).toBe('to get tired of waiting');
    expect(phraseTranslation(DEMO_SETS.en, 1, 8, 10).translation).toBe('on the platform');
  });

  it('translates in the sense of the sentence', () => {
    expect(phraseTranslation(DEMO_SETS.zh, 1, 12, 14).translation).toBe('在河岸上');
    expect(phraseTranslation(DEMO_SETS.zh, 1, 0, 2).translation).toBe('爱丽丝开始');
    expect(phraseTranslation(DEMO_SETS.zh, 1, 4, 7).translation).toBe('变得很厌烦');
  });

  it('treats a span with no phrase, or all the words, as the whole sentence', () => {
    expect(resolveSpan('en', 0, 2, 4)).toEqual({ kind: 'sentence', from: 0, to: 9 });
    expect(resolveSpan('en', 0, 0, 10)).toEqual({ kind: 'sentence', from: 0, to: 9 });
    expect(resolveSpan('en', 1, 0, 14)).toEqual({ kind: 'sentence', from: 0, to: 14 });
    expect(resolveSpan('en', 1, 1, 14)).toEqual({ kind: 'sentence', from: 0, to: 14 });
  });

  it('ignores punctuation at the edges of a span', () => {
    expect(resolveSpan('en', 0, 2, 3)).toMatchObject({ kind: 'phrase', text: 'was tired' });
    expect(resolveSpan('en', 0, 9, 10)).toMatchObject({ kind: 'phrase', text: 'bed early' });
  });
});
