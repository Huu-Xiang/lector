import type { CefrLevel, FeedLanguage } from './types';
import { ZH_COMMON_CHARS } from './zh-common-chars';

function countSyllablesEn(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  const matches = w.match(/[aeiouy]+/g);
  let count = matches ? matches.length : 1;
  if (w.endsWith('e') && count > 1) count -= 1;
  return Math.max(1, count);
}

function countSyllablesFr(word: string): number {
  const w = word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');
  if (!w) return 0;
  const matches = w.match(/[aeiouy]+/g);
  let count = matches ? matches.length : 1;
  if (w.endsWith('e') && count > 1) count -= 1;
  return Math.max(1, count);
}

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+(?:\s|$)/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).filter(Boolean).length >= 3);
}

function splitWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => /[a-zA-ZÀ-ÿ]/.test(w));
}

const HAN = /[\u3400-\u9fff]/g;

/** Characters per sentence plus the percent of characters outside the 1,000 commonest. */
function estimateCefrLevelZh(text: string): CefrLevel {
  const chars = text.match(HAN) ?? [];
  const sentences = text.split(/[。！？!?；;\n]+/).filter((s) => (s.match(HAN) ?? []).length >= 3);
  if (chars.length === 0 || sentences.length === 0) return 'B1';
  const charsPerSentence = chars.length / sentences.length;
  const rarePercent = (100 * chars.filter((c) => !ZH_COMMON_CHARS.has(c)).length) / chars.length;
  const score = charsPerSentence + rarePercent;
  if (score <= 24) return 'A2';
  if (score <= 32) return 'B1';
  if (score <= 40) return 'B2';
  return 'C1';
}

/**
 * Flesch-Kincaid grade level for English, Kandel-Moles for French, each
 * mapped to a CEFR band. Both formulas rise with sentence length and
 * syllable count, so the band edges are tuned to typical course material,
 * not a validated linguistic equivalence.
 */
export function estimateCefrLevel(text: string, language: FeedLanguage): CefrLevel {
  if (language === 'zh') return estimateCefrLevelZh(text);
  const sentences = splitSentences(text);
  const words = splitWords(text);
  if (words.length === 0 || sentences.length === 0) return 'B1';

  const wordsPerSentence = words.length / sentences.length;

  if (language === 'fr') {
    const syllables = words.reduce((total, w) => total + countSyllablesFr(w), 0);
    const syllablesPerWord = syllables / words.length;
    // Kandel-Moles: 207 - 1.015*(words/sentence) - 73.6*(syllables/word).
    const score = 207 - 1.015 * wordsPerSentence - 73.6 * syllablesPerWord;
    if (score >= 100) return 'A2';
    if (score >= 90) return 'B1';
    if (score >= 75) return 'B2';
    if (score >= 55) return 'C1';
    return 'C1';
  }

  const syllables = words.reduce((total, w) => total + countSyllablesEn(w), 0);
  const syllablesPerWord = syllables / words.length;
  // Flesch-Kincaid grade level: 0.39*(words/sentence) + 11.8*(syllables/word) - 15.59.
  const grade = 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59;
  if (grade <= 4) return 'A2';
  if (grade <= 7) return 'B1';
  if (grade <= 10) return 'B2';
  if (grade <= 13) return 'C1';
  return 'C1';
}
