import { loadVocabTestData } from './vocab-test-data';
import {
  analyzeTextDifficulty,
  type DifficultyLanguage,
  type LexiconEntry,
  type LexiconMap,
} from './text-difficulty';

const lexiconCache = new Map<string, LexiconMap>();

/**
 * Server-only: builds a compact frequency-rank + gloss lookup map from the
 * repository's curated vocab-test.json pools for English, French, and Spanish.
 * Zero runtime AI spend and deterministic across builds.
 */
export function loadDifficultyLexicon(
  language: DifficultyLanguage,
  options: { includeZh?: boolean } = {},
): LexiconMap {
  const includeZh = options.includeZh ?? true;
  const cacheKey = `${language}:${includeZh ? 'zh' : 'nozh'}`;
  const cached = lexiconCache.get(cacheKey);
  if (cached) return cached;

  const data = loadVocabTestData(undefined, language);
  const map: LexiconMap = Object.create(null) as LexiconMap;

  if (data) {
    for (const band of data.bands) {
      for (const word of band.words) {
        const key = word.w.trim().toLowerCase();
        if (!key) continue;
        const firstSense = word.s[0];
        const prev = Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
        if (prev && prev.r <= word.r) continue;
        const entry: LexiconEntry = {
          r: word.r,
          ...(firstSense?.p ? { p: firstSense.p } : {}),
          ...(firstSense?.en ? { en: firstSense.en } : {}),
          ...(includeZh && firstSense?.zh?.[0]
            ? { zh: firstSense.zh.slice(0, 2).join('；') }
            : {}),
        };
        map[key] = entry;
      }
    }
  }

  // Convert back to a plain object with safe keys for JSON/RSC serialization.
  const plain: LexiconMap = { ...map };
  lexiconCache.set(cacheKey, plain);
  return plain;
}

/**
 * Returns only the tiny subset of lexicon entries referenced by `sampleText`
 * so SSR pages never inline the full 500 KB lexicon into HTML.
 */
export function loadSampleLexiconSubset(
  language: DifficultyLanguage,
  sampleText: string,
  options: { includeZh?: boolean } = {},
): LexiconMap {
  const full = loadDifficultyLexicon(language, options);
  const analyzed = analyzeTextDifficulty(sampleText, language, full);
  const subset: LexiconMap = {};
  for (const tok of analyzed.tokens) {
    if (!tok.isWord || !tok.normalized) continue;
    if (Object.prototype.hasOwnProperty.call(full, tok.normalized)) {
      subset[tok.normalized] = full[tok.normalized];
    }
  }
  return subset;
}
