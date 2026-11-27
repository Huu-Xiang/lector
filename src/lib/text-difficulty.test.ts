import { describe, expect, it } from 'vitest';
import {
  TEXT_DIFFICULTY_SAMPLES,
  analyzeTextDifficulty,
  bandForRank,
  isDifficultyLanguage,
  type LexiconMap,
} from './text-difficulty';
import { loadDifficultyLexicon, loadSampleLexiconSubset } from './text-difficulty-data';

const MINI_EN_LEXICON: LexiconMap = {
  morning: { r: 350, p: 'n.', en: 'early part of the day', zh: '早晨' },
  walk: { r: 420, p: 'v.', en: 'move on foot', zh: '步行' },
  bread: { r: 1200, p: 'n.', en: 'baked food', zh: '面包' },
  stomach: { r: 2900, p: 'v.', en: 'tolerate or bear', zh: '忍受；胃' },
  flaw: { r: 4300, p: 'n.', en: 'defect or imperfection', zh: '缺陷' },
  apprehension: { r: 9200, p: 'n.', en: 'anxiety about the future', zh: '忧虑' },
  irreconcilable: { r: 14500, p: 'adj.', en: 'impossible to bring into agreement', zh: '不可调和的' },
};

const CEFR_INDEX: Record<string, number> = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 };

describe('text-difficulty', () => {
  it('validates supported difficulty languages', () => {
    expect(isDifficultyLanguage('en')).toBe(true);
    expect(isDifficultyLanguage('fr')).toBe(true);
    expect(isDifficultyLanguage('es')).toBe(true);
    expect(isDifficultyLanguage('de')).toBe(false);
  });

  it('maps word ranks cleanly into difficulty bands', () => {
    expect(bandForRank(200)).toBe('common');
    expect(bandForRank(2000)).toBe('common');
    expect(bandForRank(3500)).toBe('intermediate');
    expect(bandForRank(7500)).toBe('advanced');
    expect(bandForRank(15000)).toBe('rare');
  });

  it('handles empty text safely without division by zero', () => {
    const res = analyzeTextDifficulty('   ', 'en', MINI_EN_LEXICON);
    expect(res.wordCount).toBe(0);
    expect(res.cefr).toBe('A1');
    expect(res.hasUnsupportedScript).toBe(false);
    expect(res.hardWords).toEqual([]);
    expect(res.tokens).toEqual([]);
  });

  it('guards against Object.prototype keys like constructor and toString', () => {
    const res = analyzeTextDifficulty(
      'The constructor calls toString and valueOf cleanly.',
      'en',
      MINI_EN_LEXICON,
    );
    expect(res.wordCount).toBeGreaterThan(0);
    for (const tok of res.tokens) {
      if (tok.isWord) {
        expect(typeof tok.rank).toBe('number');
        expect(Number.isFinite(tok.rank)).toBe(true);
      }
    }
    for (const hw of res.hardWords) {
      expect(typeof hw.rank).toBe('number');
      expect(() => hw.rank.toLocaleString('en')).not.toThrow();
    }
  });

  it('detects unsupported non-Latin script without misclassifying CJK text as C2', () => {
    const res = analyzeTextDifficulty('这是一个用来测试中文输入的句子。', 'en', MINI_EN_LEXICON);
    expect(res.hasUnsupportedScript).toBe(true);
    expect(res.wordCount).toBe(0);
    expect(res.cefr).toBe('A1');
  });

  it('handles English contractions, French elisions, and hyphenated compounds cleanly', () => {
    const en = analyzeTextDifficulty(
      "They haven't visited this well-known shop yet.",
      'en',
      MINI_EN_LEXICON,
    );
    expect(en.hardWords.some((w) => w.normalized === 'haven')).toBe(false);
    expect(en.hardWords.some((w) => w.normalized === 'well-known')).toBe(false);

    const fr = analyzeTextDifficulty('Elle marche jusqu’à la maison.', 'fr', {});
    expect(fr.hardWords.some((w) => w.normalized === 'jusqu’à')).toBe(false);
    expect(fr.cefr).toBe('A1');
  });

  it('matches inflected words back to lexicon lemmas and preserves glosses', () => {
    const res = analyzeTextDifficulty(
      'They walked past the flaws without apprehension.',
      'en',
      MINI_EN_LEXICON,
    );
    const flaw = res.hardWords.find((w) => w.normalized === 'flaw');
    expect(flaw).toBeDefined();
    expect(flaw?.en).toBe('defect or imperfection');
    expect(flaw?.zh).toBe('缺陷');
    expect(res.hardWords.some((w) => w.normalized === 'walk')).toBe(false);
  });

  it('loads real frequency lexicons and compact sample subsets for en, fr, and es', () => {
    const en = loadDifficultyLexicon('en');
    const fr = loadDifficultyLexicon('fr');
    const es = loadDifficultyLexicon('es');
    expect(Object.keys(en).length).toBeGreaterThan(1000);
    expect(Object.keys(fr).length).toBeGreaterThan(1000);
    expect(Object.keys(es).length).toBeGreaterThan(1000);

    const subset = loadSampleLexiconSubset('en', TEXT_DIFFICULTY_SAMPLES.en[1].text, {
      includeZh: false,
    });
    expect(Object.keys(subset).length).toBeLessThan(60);
    expect(Object.values(subset).every((entry) => entry.zh === undefined)).toBe(true);
  });

  it('calibrates all 9 built-in samples monotonically and near their labeled CEFR bands', () => {
    for (const lang of ['en', 'fr', 'es'] as const) {
      const lexicon = loadDifficultyLexicon(lang);
      const scores = TEXT_DIFFICULTY_SAMPLES[lang].map((sample) => {
        const result = analyzeTextDifficulty(sample.text, lang, lexicon);
        const delta = Math.abs(CEFR_INDEX[result.cefr] - CEFR_INDEX[sample.expectedCefr]);
        expect(
          delta,
          `${lang} sample "${sample.label}" scored ${result.cefr} (expected near ${sample.expectedCefr})`,
        ).toBeLessThanOrEqual(1);
        return CEFR_INDEX[result.cefr];
      });
      // A2 sample must be strictly easier than B2, and B2 strictly easier than or equal to C1.
      expect(scores[0]).toBeLessThan(scores[1]);
      expect(scores[1]).toBeLessThan(scores[2]);
    }
  });
});
