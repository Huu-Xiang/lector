import type { CefrLevel } from './reading-level';

export type DifficultyLanguage = 'en' | 'fr' | 'es';

export const DIFFICULTY_LANGUAGES: readonly DifficultyLanguage[] = ['en', 'fr', 'es'] as const;

export function isDifficultyLanguage(value: string): value is DifficultyLanguage {
  return (DIFFICULTY_LANGUAGES as readonly string[]).includes(value);
}

export interface LexiconEntry {
  /** 1-based word frequency rank (lower = more common). */
  r: number;
  /** Part of speech label (e.g. "v.", "n.", "adj."). */
  p?: string;
  /** Concise English definition/gloss. */
  en?: string;
  /** Optional concise Chinese gloss (available for English words). */
  zh?: string;
}

export type LexiconMap = Record<string, LexiconEntry>;

export type DifficultyBand = 'common' | 'intermediate' | 'advanced' | 'rare';

export interface AnalyzedToken {
  text: string;
  normalized: string;
  isWord: boolean;
  rank: number | null;
  band: DifficultyBand | null;
  entry?: LexiconEntry;
}

export interface HardWordSummary {
  word: string;
  normalized: string;
  rank: number;
  band: 'intermediate' | 'advanced' | 'rare';
  count: number;
  pos?: string;
  en?: string;
  zh?: string;
}

export interface TextDifficultyResult {
  language: DifficultyLanguage;
  cefr: CefrLevel;
  wordCount: number;
  uniqueWords: number;
  sentenceCount: number;
  avgSentenceLength: number;
  /** Estimated word families needed for comfortable ~95% comprehension. */
  recommendedVocab: number;
  /** Percentage (0–100) of word occurrences covered within top 2,000 common words. */
  commonCoveragePct: number;
  /** Percentage (0–100) of word occurrences in advanced/rare bands (rank > 5,000). */
  hardWordPct: number;
  /** True when the input contains mostly non-Latin script characters (CJK, Cyrillic, etc.). */
  hasUnsupportedScript: boolean;
  bandCounts: Record<DifficultyBand, number>;
  tokens: AnalyzedToken[];
  hardWords: HardWordSummary[];
}

export interface DifficultySample {
  label: string;
  expectedCefr: CefrLevel;
  text: string;
}

export const TEXT_DIFFICULTY_SAMPLES: Record<DifficultyLanguage, readonly DifficultySample[]> = {
  en: [
    {
      label: 'A2 · Everyday story',
      expectedCefr: 'A2',
      text: 'Every morning Maya walked to the small shop near the station. She liked the warm smell of fresh bread and always talked with her friend for a few minutes before taking the early train to work.',
    },
    {
      label: 'B2 · Editorial',
      expectedCefr: 'B2',
      text: 'After three failed launches, the product lead still could not stomach the idea of starting over. Her team moved fast to address the underlying flaw, determined to weather the criticism and publish an honest report.',
    },
    {
      label: 'C1 · Literary',
      expectedCefr: 'C1',
      text: 'His serene demeanor concealed an acute apprehension; beneath the ornate veneer of diplomatic etiquette, the delegates harbored irreconcilable grievances that threatened to unravel decades of fragile consensus.',
    },
  ],
  fr: [
    {
      label: 'A2 · Récit simple',
      expectedCefr: 'A2',
      text: 'Chaque matin, Claire marche jusqu’à la petite maison près du jardin. Elle aime le pain chaud et parle toujours quelques minutes avec son ami avant de prendre le train pour aller au travail.',
    },
    {
      label: 'B2 · Presse',
      expectedCefr: 'B2',
      text: 'Malgré les inquiétudes exprimées par plusieurs chercheurs, la municipalité a décidé de maintenir son programme expérimental afin de réduire la circulation automobile dans les quartiers historiques.',
    },
    {
      label: 'C1 · Littéraire',
      expectedCefr: 'C1',
      text: 'Sous une apparence impassible, l’orateur dissimulait une profonde perplexité face aux contradictions manifestes d’un traité dont chacun pressentait déjà la fragilité inexorable.',
    },
  ],
  es: [
    {
      label: 'A2 · Historia corta',
      expectedCefr: 'A2',
      text: 'Cada mañana Lucía caminaba hasta la pequeña casa cerca del parque. Le gustaba el pan caliente y siempre hablaba unos minutos con su amigo antes de tomar el tren para ir al trabajo.',
    },
    {
      label: 'B2 · Artículo',
      expectedCefr: 'B2',
      text: 'Aunque varios analistas advirtieron sobre el impacto económico a corto plazo, la comisión resolvió acelerar la transición energética y reforzar la transparencia en los informes públicos.',
    },
    {
      label: 'C1 · Literario',
      expectedCefr: 'C1',
      text: 'Aquel silencio imperturbable encubría una honda incertidumbre; tras la retórica conciliadora del discurso oficial persistían discrepancias irreconciliables que amenazaban con fracturar el acuerdo.',
    },
  ],
};

/**
 * High-frequency function words and everyday A1 words that may be absent from
 * sparse vocabulary-test sample pools.
 */
const CORE_STOPWORDS: Record<DifficultyLanguage, Set<string>> = {
  en: new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'so', 'as', 'at', 'by', 'for', 'from',
    'in', 'into', 'of', 'on', 'to', 'with', 'up', 'out', 'off', 'over', 'under', 'about', 'near',
    'before', 'after', 'every', 'few', 'always', 'never', 'often', 'sometimes', 'today', 'morning',
    'i', 'me', 'my', 'mine', 'you', 'your', 'yours', 'he', 'him', 'his', 'she', 'her', 'hers',
    'it', 'its', 'we', 'us', 'our', 'ours', 'they', 'them', 'their', 'theirs', 'this', 'that',
    'these', 'those', 'who', 'whom', 'whose', 'which', 'what', 'where', 'when', 'why', 'how',
    'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
    'did', 'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
    'not', 'no', 'yes', 'all', 'any', 'some', 'one', 'two', 'three', 'more', 'most', 'very',
    'just', 'also', 'too', 'only', 'now', 'here', 'there', 'than', 'well', 'back', 'down',
    'still', 'even', 'much', 'many', 'such', 'own', 'same', 'other', 'new', 'good', 'warm',
    'first', 'last', 'long', 'great', 'little', 'big', 'old', 'right', 'high', 'small', 'early',
    'fresh', 'work', 'friend', 'train', 'bread', 'shop', 'station', 'walk', 'talk', 'like', 'take',
    'minute', 'minutes', 'day', 'time', 'year', 'people', 'way', 'man', 'woman', 'child', 'house',
    'home', 'book', 'read', 'write', 'say', 'go', 'come', 'see', 'know', 'get', 'make', 'think',
  ]),
  fr: new Set([
    'le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd', 'au', 'aux', 'et', 'ou', 'mais',
    'donc', 'or', 'ni', 'car', 'que', 'qu', 'qui', 'quoi', 'dont', 'où', 'si', 's', 'ne', 'n',
    'pas', 'plus', 'je', 'j', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'me', 'm',
    'te', 't', 'se', 'lui', 'leur', 'leurs', 'ce', 'c', 'cet', 'cette', 'ces', 'mon', 'ma', 'mes',
    'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'notre', 'nos', 'votre', 'vos', 'à', 'en', 'dans',
    'sur', 'sous', 'avec', 'sans', 'pour', 'par', 'vers', 'chez', 'entre', 'près', 'avant', 'après',
    'chaque', 'toujours', 'jamais', 'quelques', 'petit', 'petite', 'grand', 'grande', 'bon', 'bonne',
    'chaud', 'chaude', 'matin', 'soir', 'jour', 'temps', 'maison', 'jardin', 'pain', 'ami', 'amie',
    'train', 'travail', 'minute', 'minutes', 'est', 'sont', 'suis', 'es', 'sommes', 'êtes', 'était',
    'étaient', 'être', 'été', 'a', 'as', 'ai', 'avons', 'avez', 'ont', 'avait', 'avoir', 'fait',
    'faire', 'va', 'vais', 'aller', 'prend', 'prendre', 'parle', 'parler', 'marche', 'marcher',
    'aime', 'aimer', 'tout', 'tous', 'toute', 'toutes', 'très', 'bien', 'aussi', 'comme', 'peu',
    'beaucoup', 'encore', 'déjà', 'ici', 'là', 'oui', 'non', 'y', 'jusqu', 'jusque', 'afin',
  ]),
  es: new Set([
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'a', 'en', 'con',
    'por', 'para', 'sin', 'sobre', 'entre', 'hasta', 'desde', 'hacia', 'cerca', 'antes', 'después',
    'y', 'e', 'o', 'u', 'pero', 'sino', 'que', 'quien', 'quienes', 'cual', 'cuales', 'donde',
    'cuando', 'como', 'porque', 'aunque', 'si', 'no', 'sí', 'yo', 'tú', 'él', 'ella', 'nosotros',
    'nosotras', 'vosotros', 'ellos', 'ellas', 'usted', 'ustedes', 'me', 'te', 'se', 'nos', 'os',
    'le', 'les', 'lo', 'mi', 'mis', 'tu', 'tus', 'su', 'sus', 'nuestro', 'nuestra', 'este', 'esta',
    'estos', 'estas', 'ese', 'esa', 'esos', 'esas', 'eso', 'esto', 'aquel', 'cada', 'siempre',
    'nunca', 'pequeño', 'pequeña', 'grande', 'bueno', 'buena', 'caliente', 'mañana', 'tarde',
    'noche', 'día', 'tiempo', 'casa', 'parque', 'pan', 'amigo', 'amiga', 'tren', 'trabajo',
    'minuto', 'minutos', 'es', 'son', 'soy', 'eres', 'somos', 'era', 'fue', 'ser', 'está', 'están',
    'estoy', 'estar', 'ha', 'han', 'he', 'hemos', 'hay', 'haber', 'tiene', 'tienen', 'tener',
    'hace', 'hacer', 'ir', 'va', 'tomar', 'hablar', 'hablaba', 'caminar', 'caminaba', 'gustar',
    'gustaba', 'todo', 'todos', 'toda', 'todas', 'muy', 'más', 'menos', 'ya', 'también', 'solo',
    'sólo', 'aquí', 'allí', 'bien', 'mal', 'uno', 'dos', 'tres', 'varios', 'varias',
  ]),
};

const EN_CONTRACTIONS: Record<string, string> = {
  "don't": 'do',
  "doesn't": 'do',
  "didn't": 'do',
  "won't": 'will',
  "wouldn't": 'would',
  "can't": 'can',
  "couldn't": 'could',
  "shouldn't": 'should',
  "isn't": 'is',
  "aren't": 'are',
  "wasn't": 'was',
  "weren't": 'were',
  "haven't": 'have',
  "hasn't": 'have',
  "hadn't": 'have',
  "mustn't": 'must',
};

function hasOwnEntry(lexicon: LexiconMap, key: string): LexiconEntry | undefined {
  return Object.prototype.hasOwnProperty.call(lexicon, key) ? lexicon[key] : undefined;
}

/** Simple suffix stemmer to recover common inflections when the exact surface word is absent. */
function candidateLemmas(word: string, language: DifficultyLanguage): string[] {
  const candidates: string[] = [word];
  if (language === 'en') {
    if (word.endsWith('ies') && word.length > 4) candidates.push(`${word.slice(0, -3)}y`);
    if (word.endsWith('ied') && word.length > 4) candidates.push(`${word.slice(0, -3)}y`);
    if (word.endsWith('ing') && word.length > 5) {
      const stem = word.slice(0, -3);
      candidates.push(stem, `${stem}e`);
      if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2]) {
        candidates.push(stem.slice(0, -1));
      }
    }
    if (word.endsWith('ed') && word.length > 4) {
      const stem = word.slice(0, -2);
      candidates.push(stem, `${stem}e`);
      if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2]) {
        candidates.push(stem.slice(0, -1));
      }
    }
    if (word.endsWith('es') && word.length > 4) candidates.push(word.slice(0, -2), word.slice(0, -1));
    if (word.endsWith('s') && word.length > 3 && !word.endsWith('ss')) candidates.push(word.slice(0, -1));
    if (word.endsWith('ly') && word.length > 4) candidates.push(word.slice(0, -2));
  } else if (language === 'fr') {
    if (word.endsWith('aux') && word.length > 4) candidates.push(`${word.slice(0, -3)}al`);
    if (word.endsWith('es') && word.length > 4) candidates.push(word.slice(0, -2), word.slice(0, -1));
    if (word.endsWith('s') && word.length > 3) candidates.push(word.slice(0, -1));
    if (word.endsWith('e') && word.length > 4) candidates.push(word.slice(0, -1));
    if (word.endsWith('ent') && word.length > 5) candidates.push(`${word.slice(0, -3)}er`);
    if (word.endsWith('ait') && word.length > 5) candidates.push(`${word.slice(0, -3)}er`);
    if (word.endsWith('é') && word.length > 3) candidates.push(`${word.slice(0, -1)}er`);
    if (word.endsWith('ée') && word.length > 4) candidates.push(`${word.slice(0, -2)}er`);
    if (word.endsWith('és') && word.length > 4) candidates.push(`${word.slice(0, -2)}er`);
  } else if (language === 'es') {
    if (word.endsWith('es') && word.length > 4) candidates.push(word.slice(0, -2), word.slice(0, -1));
    if (word.endsWith('s') && word.length > 3) candidates.push(word.slice(0, -1));
    if (word.endsWith('a') && word.length > 4) candidates.push(`${word.slice(0, -1)}o`);
    if (word.endsWith('ando') && word.length > 5) candidates.push(`${word.slice(0, -4)}ar`);
    if (word.endsWith('iendo') && word.length > 6) {
      candidates.push(`${word.slice(0, -5)}er`, `${word.slice(0, -5)}ir`);
    }
    if (word.endsWith('ado') && word.length > 5) candidates.push(`${word.slice(0, -3)}ar`);
    if (word.endsWith('ido') && word.length > 5) {
      candidates.push(`${word.slice(0, -3)}er`, `${word.slice(0, -3)}ir`);
    }
    if (word.endsWith('aba') && word.length > 5) candidates.push(`${word.slice(0, -3)}ar`);
    if (word.endsWith('aban') && word.length > 6) candidates.push(`${word.slice(0, -4)}ar`);
    if (word.endsWith('ía') && word.length > 4) {
      candidates.push(`${word.slice(0, -2)}er`, `${word.slice(0, -2)}ir`);
    }
    if (word.endsWith('ían') && word.length > 5) {
      candidates.push(`${word.slice(0, -3)}er`, `${word.slice(0, -3)}ir`);
    }
  }
  return candidates;
}

export function bandForRank(rank: number): DifficultyBand {
  if (rank <= 2000) return 'common';
  if (rank <= 5000) return 'intermediate';
  if (rank <= 10000) return 'advanced';
  return 'rare';
}

function normalizeLookupPiece(rawWord: string, language: DifficultyLanguage): string {
  const straight = rawWord.replace(/’/g, "'").toLowerCase();
  if (language === 'en') {
    if (Object.prototype.hasOwnProperty.call(EN_CONTRACTIONS, straight)) {
      return EN_CONTRACTIONS[straight];
    }
    if (straight.endsWith("n't") && straight.length > 4) {
      return straight.slice(0, -3);
    }
    return straight.replace(/'(s|re|ve|ll|d|m)$/i, '');
  }
  if (language === 'fr') {
    const elision = /^(?:jusqu|qu|[cdjlmnst])'(.+)$/iu.exec(straight);
    if (elision) return elision[1];
  }
  return straight;
}

function lookupSingleWord(
  word: string,
  language: DifficultyLanguage,
  lexicon: LexiconMap,
  isSentenceStart: boolean,
  isCapitalized: boolean,
): { normalized: string; rank: number; matched: boolean; entry?: LexiconEntry } {
  const lower = word.toLowerCase();
  if (CORE_STOPWORDS[language].has(lower)) {
    const existing = hasOwnEntry(lexicon, lower);
    return {
      normalized: lower,
      rank: existing ? Math.min(existing.r, 500) : 250,
      matched: true,
      entry: existing,
    };
  }
  for (const cand of candidateLemmas(lower, language)) {
    if (CORE_STOPWORDS[language].has(cand)) {
      const existing = hasOwnEntry(lexicon, cand);
      return {
        normalized: cand,
        rank: existing ? Math.min(existing.r, 600) : 350,
        matched: true,
        entry: existing,
      };
    }
    const hit = hasOwnEntry(lexicon, cand);
    if (hit) {
      return { normalized: cand, rank: hit.r, matched: true, entry: hit };
    }
  }
  // Mid-sentence capitalized proper names (e.g. "Maya", "Claire", "Lucía") are not hard vocab.
  if (!isSentenceStart && isCapitalized) {
    return { normalized: lower, rank: 800, matched: true };
  }
  if (lower.length <= 4) {
    return { normalized: lower, rank: 1200, matched: false };
  }
  // Sparse-lexicon friendly OOV fallback: short/medium words stay moderate;
  // only long morphologically complex words (>= 11 chars) imply advanced/rare difficulty.
  const fallbackRank =
    lower.length >= 12 ? 10500 : lower.length >= 10 ? 6800 : lower.length >= 8 ? 3200 : 1800;
  return { normalized: lower, rank: fallbackRank, matched: false };
}

function lookupWord(
  rawWord: string,
  language: DifficultyLanguage,
  lexicon: LexiconMap,
  isSentenceStart: boolean,
): { normalized: string; rank: number; matched: boolean; entry?: LexiconEntry } {
  const isCapitalized = /^\p{Lu}/u.test(rawWord);
  const piece = normalizeLookupPiece(rawWord, language);

  // Split hyphenated compounds (e.g. "well-known", "short-term") if the joined form is OOV.
  if (piece.includes('-') && !hasOwnEntry(lexicon, piece)) {
    const parts = piece.split('-').filter((p) => p.length > 0);
    if (parts.length > 1) {
      const results = parts.map((p, idx) =>
        lookupSingleWord(p, language, lexicon, isSentenceStart && idx === 0, false),
      );
      const hardest = results.reduce((best, cur) => (cur.rank > best.rank ? cur : best), results[0]);
      return {
        normalized: piece,
        rank: hardest.rank,
        matched: results.some((r) => r.matched),
        entry: hardest.entry,
      };
    }
  }

  return lookupSingleWord(piece || rawWord, language, lexicon, isSentenceStart, isCapitalized);
}

function estimateCefr(
  lexicalRank: number,
  hardWordPct: number,
  avgSentenceLength: number,
): { cefr: CefrLevel; recommendedVocab: number } {
  // Blend lexical rank ceiling, advanced/rare density, and syntactic length.
  const sentencePenalty = avgSentenceLength > 26 ? 900 : avgSentenceLength > 20 ? 400 : 0;
  const densityPenalty = hardWordPct * 120;
  const score = lexicalRank + sentencePenalty + densityPenalty;

  if (score < 1100) return { cefr: 'A1', recommendedVocab: 1000 };
  if (score < 3000) return { cefr: 'A2', recommendedVocab: 2000 };
  if (score < 5400) return { cefr: 'B1', recommendedVocab: 3500 };
  if (score < 10200) return { cefr: 'B2', recommendedVocab: 5500 };
  if (score < 14500) return { cefr: 'C1', recommendedVocab: 8500 };
  return { cefr: 'C2', recommendedVocab: 12000 };
}

const TOKEN_RE = /([\p{Script=Latin}]+(?:['’-][\p{Script=Latin}]+)*|[^\p{Script=Latin}]+)/gu;
const LATIN_WORD_RE = /\p{Script=Latin}/u;
const NON_LATIN_LETTER_RE = /(?:\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}|\p{Script=Cyrillic}|\p{Script=Arabic}|\p{Script=Greek})/gu;

export function analyzeTextDifficulty(
  text: string,
  language: DifficultyLanguage,
  lexicon: LexiconMap,
): TextDifficultyResult {
  const trimmed = text.trim();
  const bandCounts: Record<DifficultyBand, number> = {
    common: 0,
    intermediate: 0,
    advanced: 0,
    rare: 0,
  };

  if (!trimmed) {
    return {
      language,
      cefr: 'A1',
      wordCount: 0,
      uniqueWords: 0,
      sentenceCount: 0,
      avgSentenceLength: 0,
      recommendedVocab: 1000,
      commonCoveragePct: 100,
      hardWordPct: 0,
      hasUnsupportedScript: false,
      bandCounts,
      tokens: [],
      hardWords: [],
    };
  }

  const nonLatinChars = (trimmed.match(NON_LATIN_LETTER_RE) ?? []).length;
  const latinChars = (trimmed.match(/\p{Script=Latin}/gu) ?? []).length;
  const hasUnsupportedScript = nonLatinChars > 0 && nonLatinChars > latinChars;

  const rawParts = trimmed.match(TOKEN_RE) ?? [];
  const tokens: AnalyzedToken[] = [];
  const allWordRanks: number[] = [];
  const uniqueSet = new Set<string>();
  const hardMap = new Map<string, HardWordSummary>();

  let isSentenceStart = true;

  for (const part of rawParts) {
    const isWord = LATIN_WORD_RE.test(part);
    if (!isWord) {
      tokens.push({ text: part, normalized: '', isWord: false, rank: null, band: null });
      if (/[.!?。！？\n]/.test(part)) {
        isSentenceStart = true;
      }
      continue;
    }

    const { normalized, rank, entry } = lookupWord(
      part,
      language,
      lexicon,
      isSentenceStart,
    );
    isSentenceStart = false;

    const band = bandForRank(rank);
    bandCounts[band] += 1;
    allWordRanks.push(rank);
    uniqueSet.add(normalized);

    tokens.push({
      text: part,
      normalized,
      isWord: true,
      rank,
      band,
      entry,
    });

    if (band !== 'common') {
      const prev = hardMap.get(normalized);
      if (prev) {
        prev.count += 1;
      } else {
        hardMap.set(normalized, {
          word: part,
          normalized,
          rank,
          band,
          count: 1,
          pos: entry?.p,
          en: entry?.en,
          zh: entry?.zh,
        });
      }
    }
  }

  const wordCount = allWordRanks.length;
  const sentences = trimmed
    .split(/[.!?。！？\n]+/u)
    .map((s) => s.trim())
    .filter((s) => LATIN_WORD_RE.test(s));
  const sentenceCount = Math.max(1, sentences.length);
  const avgSentenceLength = wordCount > 0 ? Math.round((wordCount / sentenceCount) * 10) / 10 : 0;

  const rankPool = [...allWordRanks].sort((a, b) => a - b);
  const p90Idx = Math.min(rankPool.length - 1, Math.floor(rankPool.length * 0.9));
  const p90Rank = rankPool[p90Idx] ?? 1000;

  const commonCoveragePct =
    wordCount > 0 ? Math.round((bandCounts.common / wordCount) * 100) : 100;
  const hardWordPct =
    wordCount > 0
      ? Math.round(((bandCounts.advanced + bandCounts.rare) / wordCount) * 100)
      : 0;

  const { cefr, recommendedVocab } = estimateCefr(p90Rank, hardWordPct, avgSentenceLength);

  const hardWords = [...hardMap.values()]
    .sort((a, b) => {
      if (b.rank !== a.rank) return b.rank - a.rank;
      const aHasGloss = a.en || a.zh ? 1 : 0;
      const bHasGloss = b.en || b.zh ? 1 : 0;
      return bHasGloss - aHasGloss;
    })
    .slice(0, 24);

  return {
    language,
    cefr,
    wordCount,
    uniqueWords: uniqueSet.size,
    sentenceCount,
    avgSentenceLength,
    recommendedVocab,
    commonCoveragePct,
    hardWordPct,
    hasUnsupportedScript,
    bandCounts,
    tokens,
    hardWords,
  };
}
