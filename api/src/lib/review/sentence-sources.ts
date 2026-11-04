import { createHash } from 'crypto';
import type { VocabType } from '../../db';
import { dictionaryExampleSentences, dictionaryWordForms } from '../dictionary-db';
import {
  foldWord,
  getLanguageConfig,
  isValidLanguageCode,
  tokenizeWords,
  type LanguageCode,
  type LanguageConfig,
} from '../languages';
import { loadSentenceBankRows, type SentenceBankRow } from '../sentence-bank-loader';
import {
  candidateChapters,
  chapterSentences,
  getLibraryIndex,
  sentenceAt,
  type LibraryIndex,
} from './sentence-index';

export interface SentenceBlank {
  tokenStart: number;
  tokenEnd: number;
  start: number;
  end: number;
}

export interface SentenceSource {
  kind: 'saved' | 'library' | 'tatoeba' | 'ai';
  bookSlug?: string;
  bookTitle?: string;
  bookTitles?: Record<string, string>;
  chapterTitle?: string;
  tatoebaId?: number;
  tatoebaSearchText?: string;
}

export interface FoundSentence {
  key: string;
  text: string;
  wordCount: number;
  blank?: SentenceBlank;
  source: SentenceSource;
  translation?: { text: string; lang: string };
}

export interface SentenceRequest {
  word: string;
  type: VocabType;
  language: string;
  level: string | null;
  savedSentence: string;
  lastSentenceKey: string | null;
  skipSaved?: boolean;
}

export interface DictionaryExample {
  text: string;
  translation?: string;
  translationLang?: string;
}

export interface SentenceDeps {
  forms: (word: string, language: string) => string[];
  examples: (word: string, language: string) => DictionaryExample[];
  /** Bank rows whose cloze word is one of `words` (folded), or null while the bank loads. */
  bank: (language: string, words: string[]) => SentenceBankRow[] | null;
  library: (language: string) => LibraryIndex | null;
  random: () => number;
}

interface Candidate extends FoundSentence {
  levelDistance: number;
}

interface Matcher {
  fold: (word: string) => string;
  pack: LanguageConfig;
  all: string[][];
  byFirst: Map<string, string[][]>;
}

const SKIPPED_LANGUAGES = new Set(['zh', 'ko']);
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const SAVED_KEY = 'saved';
const GOOD_MIN = 6;
const GOOD_MAX = 18;
const LONG_LIMIT = 30;
const IDEAL = 12;
const POOL = 4;
const MAX_CHAPTERS = 40;
const ENOUGH_LIBRARY_MATCHES = 24;
const MAX_EXAMPLES = 40;

const banks = new Map<string, { loaded: boolean; byWord: Map<string, SentenceBankRow[]> }>();

function bundledBank(language: string, words: string[]): SentenceBankRow[] | null {
  let entry = banks.get(language);
  if (!entry) {
    const created = { loaded: false, byWord: new Map<string, SentenceBankRow[]>() };
    entry = created;
    banks.set(language, created);
    const pack = getLanguageConfig(language as LanguageCode);
    loadSentenceBankRows(language)
      .catch(() => [])
      .then((rows) => {
        for (const row of rows) {
          if (row.source === 'mined' || typeof row.id !== 'number') continue;
          const key = foldWord(row.clozeWord, pack);
          const list = created.byWord.get(key);
          if (list) list.push(row);
          else created.byWord.set(key, [row]);
        }
        created.loaded = true;
      });
  }
  if (!entry.loaded) return null;
  return words.flatMap((word) => entry.byWord.get(word) ?? []);
}

const defaultDeps: SentenceDeps = {
  forms: dictionaryWordForms,
  examples: dictionaryExampleSentences,
  bank: bundledBank,
  library: getLibraryIndex,
  random: Math.random,
};

export function supportsSentenceFinder(language: string): boolean {
  if (!isValidLanguageCode(language) || SKIPPED_LANGUAGES.has(language)) return false;
  return getLanguageConfig(language).script.kind !== 'cjk-unspaced';
}

function levelDistance(bookLevel: string, learnerLevel: string | null): number {
  const learner = learnerLevel ? LEVELS.indexOf(learnerLevel) : -1;
  if (learner < 0) return 0;
  const book = LEVELS.indexOf(bookLevel);
  return book < 0 ? LEVELS.length : Math.abs(book - learner);
}

function lengthTier(words: number): number {
  if (words >= GOOD_MIN && words <= GOOD_MAX) return 0;
  return words >= 4 && words <= LONG_LIMIT ? 1 : 2;
}

/** Best first: 6 to 18 words, then nearest book level, then closest to 12 words. */
export function rankCandidates<T extends { wordCount: number; levelDistance: number }>(
  candidates: T[],
): T[] {
  return [...candidates].sort(
    (a, b) =>
      lengthTier(a.wordCount) - lengthTier(b.wordCount) ||
      a.levelDistance - b.levelDistance ||
      Math.abs(a.wordCount - IDEAL) - Math.abs(b.wordCount - IDEAL),
  );
}

function pickFrom(candidates: Candidate[], last: string | null, random: () => number) {
  const ranked = rankCandidates(candidates.filter((c) => c.key !== last));
  const best = ranked[0];
  if (!best) return null;
  const pool = ranked
    .filter(
      (c) =>
        lengthTier(c.wordCount) === lengthTier(best.wordCount) &&
        c.levelDistance === best.levelDistance,
    )
    .slice(0, POOL);
  const { levelDistance: _distance, ...found } =
    pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  return found as FoundSentence;
}

function makeMatcher(language: string, forms: string[]): Matcher {
  const pack = getLanguageConfig(language as LanguageCode);
  const fold = (word: string) => foldWord(word, pack);
  const all: string[][] = [];
  const seen = new Set<string>();
  for (const form of forms) {
    const tokens = tokenizeWords(form, pack).map((t) => fold(t.text));
    const id = tokens.join(' ');
    if (tokens.length === 0 || seen.has(id)) continue;
    seen.add(id);
    all.push(tokens);
  }
  const byFirst = new Map<string, string[][]>();
  for (const tokens of all) {
    const list = byFirst.get(tokens[0]);
    if (list) list.push(tokens);
    else byFirst.set(tokens[0], [tokens]);
  }
  for (const list of byFirst.values()) list.sort((a, b) => b.length - a.length);
  return { fold, pack, all, byFirst };
}

function matchSpan(text: string, m: Matcher): { blank: SentenceBlank; wordCount: number } | null {
  const tokens = tokenizeWords(text, m.pack);
  const folded = tokens.map((t) => m.fold(t.text));
  for (let i = 0; i < tokens.length; i++) {
    for (const pattern of m.byFirst.get(folded[i]) ?? []) {
      if (i + pattern.length > tokens.length) continue;
      let ok = true;
      for (let j = 1; j < pattern.length && ok; j++) {
        ok =
          folded[i + j] === pattern[j] &&
          text.slice(tokens[i + j - 1].end, tokens[i + j].start).trim() === '';
      }
      if (!ok) continue;
      return {
        wordCount: tokens.length,
        blank: {
          tokenStart: i,
          tokenEnd: i + pattern.length,
          start: tokens[i].start,
          end: tokens[i + pattern.length - 1].end,
        },
      };
    }
  }
  return null;
}

const normal = (text: string) => text.replace(/\s+/g, ' ').trim();

function librarySentences(
  request: SentenceRequest,
  deps: SentenceDeps,
  m: Matcher,
  saved: string,
): Candidate[] {
  const index = deps.library(request.language);
  if (!index) return [];
  const seed = createHash('sha1').update(m.all[0].join(' ')).digest().readUInt32LE(0);
  const chapters = candidateChapters(index, m.all)
    .map((chapter) => ({
      chapter,
      distance: levelDistance(chapter.bookLevel, request.level),
      order: Math.imul(chapter.id ^ seed, 0x9e3779b1) >>> 0,
    }))
    .sort((a, b) => a.distance - b.distance || a.order - b.order)
    .slice(0, MAX_CHAPTERS);
  const found: Candidate[] = [];
  for (const { chapter, distance } of chapters) {
    const sentences = chapterSentences(index, chapter);
    if (!sentences) continue;
    for (let i = 0; i < sentences.count; i++) {
      const text = sentenceAt(sentences, i);
      if (text === saved) continue;
      const span = matchSpan(text, m);
      if (!span) continue;
      found.push({
        key: `L:${chapter.bookSlug}:${chapter.lessonIndex}:${sentences.starts[i]}`,
        text,
        wordCount: sentences.words[i],
        blank: span.blank,
        source: {
          kind: 'library',
          bookSlug: chapter.bookSlug,
          bookTitle: chapter.bookTitle,
          bookTitles: chapter.bookTitles,
          chapterTitle: chapter.chapterTitle,
        },
        levelDistance: distance,
      });
    }
    if (found.length >= ENOUGH_LIBRARY_MATCHES) break;
  }
  return found;
}

function tatoebaSentences(
  request: SentenceRequest,
  deps: SentenceDeps,
  m: Matcher,
  saved: string,
): Candidate[] {
  const found: Candidate[] = [];
  for (const example of deps.examples(request.word, request.language).slice(0, MAX_EXAMPLES)) {
    const span = matchSpan(example.text, m);
    if (!span || normal(example.text) === saved) continue;
    found.push({
      key: `E:${createHash('sha1').update(example.text).digest('hex').slice(0, 12)}`,
      text: example.text,
      wordCount: span.wordCount,
      blank: span.blank,
      source: { kind: 'tatoeba', tatoebaSearchText: example.text },
      ...(example.translation && example.translationLang
        ? { translation: { text: example.translation, lang: example.translationLang } }
        : {}),
      levelDistance: 0,
    });
  }
  const rows = deps.bank(request.language, [...m.byFirst.keys()]) ?? [];
  for (const row of rows) {
    if (row.source === 'mined' || typeof row.id !== 'number') continue;
    const span = matchSpan(row.text, m);
    if (!span || normal(row.text) === saved) continue;
    found.push({
      key: `T:${row.id}`,
      text: row.text,
      wordCount: span.wordCount,
      blank: span.blank,
      source: { kind: 'tatoeba', tatoebaId: row.id },
      ...(row.translation ? { translation: { text: row.translation, lang: 'en' } } : {}),
      levelDistance: 0,
    });
    if (found.length >= MAX_EXAMPLES * 2) break;
  }
  return found;
}

/**
 * The next sentence for a card: its saved sentence on the first serve, then
 * library sentences, then bundled Tatoeba ones, then the saved sentence again.
 * The sentence served last time is skipped whenever another exists.
 */
export function findSentence(
  request: SentenceRequest,
  deps: SentenceDeps = defaultDeps,
): FoundSentence | null {
  if (!supportsSentenceFinder(request.language)) return null;
  const forms =
    request.type === 'phrase'
      ? [request.word]
      : [request.word, ...deps.forms(request.word, request.language)];
  const m = makeMatcher(request.language, forms);
  const saved = normal(request.savedSentence);
  const savedResult = (): FoundSentence | null => {
    if (saved === '' || request.skipSaved) return null;
    const span = matchSpan(saved, m);
    return {
      key: SAVED_KEY,
      text: saved,
      wordCount: span?.wordCount ?? tokenizeWords(saved, m.pack).length,
      ...(span ? { blank: span.blank } : {}),
      source: { kind: 'saved' },
    };
  };
  if (m.all.length === 0) return savedResult();
  if (request.lastSentenceKey === null) {
    const first = savedResult();
    if (first) return first;
  }
  return (
    pickFrom(librarySentences(request, deps, m, saved), request.lastSentenceKey, deps.random) ??
    pickFrom(tatoebaSentences(request, deps, m, saved), request.lastSentenceKey, deps.random) ??
    savedResult()
  );
}

function matcherFor(
  request: Pick<SentenceRequest, 'word' | 'type' | 'language'>,
  deps: Pick<SentenceDeps, 'forms'>,
): Matcher {
  const forms =
    request.type === 'phrase'
      ? [request.word]
      : [request.word, ...deps.forms(request.word, request.language)];
  return makeMatcher(request.language, forms);
}

/** Where the word or one of its forms stands in `text` as whole tokens, or null if it does not. */
export function blankIn(
  request: Pick<SentenceRequest, 'word' | 'type' | 'language'>,
  text: string,
  deps: Pick<SentenceDeps, 'forms'> = defaultDeps,
): SentenceBlank | null {
  if (!supportsSentenceFinder(request.language)) return null;
  return matchSpan(text, matcherFor(request, deps))?.blank ?? null;
}

/** The library or Tatoeba sentence a key names, so a client sends a key and never text. */
export function findSentenceByKey(
  request: SentenceRequest,
  key: string,
  deps: SentenceDeps = defaultDeps,
): FoundSentence | null {
  if (!supportsSentenceFinder(request.language)) return null;
  const m = matcherFor(request, deps);
  if (m.all.length === 0) return null;
  const saved = normal(request.savedSentence);
  const candidates = key.startsWith('L:')
    ? librarySentences(request, deps, m, saved)
    : key.startsWith('E:') || key.startsWith('T:')
      ? tatoebaSentences(request, deps, m, saved)
      : [];
  const hit = candidates.find((c) => c.key === key);
  if (!hit) return null;
  const { levelDistance: _distance, ...found } = hit;
  return found;
}
