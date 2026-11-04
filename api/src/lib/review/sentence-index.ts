import {
  getLanguageConfig,
  isValidLanguageCode,
  splitSentences,
  tokenizeWords,
  type LanguageCode,
} from '../languages';
import {
  libraryBookTitles,
  listLibraryBooks,
  loadLibraryBook,
  loadLibraryLesson,
} from '../library-content';

export interface Chapter {
  id: number;
  bookSlug: string;
  bookTitle: string;
  bookTitles: Record<string, string>;
  bookLevel: string;
  lessonIndex: number;
  sourceFile: string;
  chapterTitle: string;
  wordCount: number;
  bloom: Uint32Array;
}

export interface LibraryIndex {
  language: LanguageCode;
  chapters: Chapter[];
}

export interface ChapterSentences {
  text: string;
  count: number;
  starts: Uint32Array;
  ends: Uint32Array;
  words: Uint16Array;
}

const MIN_SENTENCE_WORDS = 3;
const MAX_SENTENCE_WORDS = 80;
const SLICE_MS = 10;
const SENTENCE_CACHE_SIZE = 48;

const lowered = new Map<number, number>();
const WORD_CHAR = /[\p{L}\p{M}\p{N}]/u;

function lowerWordChar(code: number): number {
  if (code < 128) {
    if ((code >= 97 && code <= 122) || (code >= 48 && code <= 57)) return code;
    return code >= 65 && code <= 90 ? code + 32 : 0;
  }
  let value = lowered.get(code);
  if (value === undefined) {
    const char = String.fromCharCode(code);
    value = WORD_CHAR.test(char) ? char.toLowerCase().charCodeAt(0) : 0;
    lowered.set(code, value);
  }
  return value;
}

/** Calls `visit` with a hash for every run of letters, marks and digits, lower-cased. */
function forEachRun(text: string, visit: (hash: number) => void): void {
  let hash = 0;
  let inRun = false;
  for (let i = 0; i <= text.length; i++) {
    const code = i < text.length ? lowerWordChar(text.charCodeAt(i)) : 0;
    if (code) {
      hash = Math.imul(hash ^ code, 16777619);
      inRun = true;
    } else if (inRun) {
      visit(hash);
      hash = 0;
      inRun = false;
    }
  }
}

const second = (hash: number) => Math.imul(hash, 0x9e3779b1) >>> 7;

function bloomBitsFor(chars: number): number {
  return 1 << Math.max(10, 32 - Math.clz32((chars / 6) * 4));
}

function addToBloom(bloom: Uint32Array, hash: number): void {
  const mask = bloom.length * 32 - 1;
  const a = hash & mask;
  const b = second(hash) & mask;
  bloom[a >>> 5] |= 1 << (a & 31);
  bloom[b >>> 5] |= 1 << (b & 31);
}

function inBloom(bloom: Uint32Array, hash: number): boolean {
  const mask = bloom.length * 32 - 1;
  const a = hash & mask;
  const b = second(hash) & mask;
  return (bloom[a >>> 5] & (1 << (a & 31))) !== 0 && (bloom[b >>> 5] & (1 << (b & 31))) !== 0;
}

function indexChapter(markdown: string): { bloom: Uint32Array; wordCount: number } {
  const bloom = new Uint32Array(bloomBitsFor(markdown.length) >>> 5);
  let wordCount = 0;
  forEachRun(markdown, (hash) => {
    wordCount++;
    addToBloom(bloom, hash);
  });
  return { bloom, wordCount };
}

const states = new Map<
  string,
  { promise: Promise<LibraryIndex | null>; index: LibraryIndex | null; builds: number }
>();

const yieldTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

async function build(language: LanguageCode): Promise<LibraryIndex | null> {
  await yieldTurn();
  const chapters: Chapter[] = [];
  try {
    const titles = libraryBookTitles(language);
    let sliceStart = performance.now();
    for (const summary of listLibraryBooks(language)) {
      const book = loadLibraryBook(language, summary.slug);
      if (!book) continue;
      for (let lessonIndex = 0; lessonIndex < book.lessons.length; lessonIndex++) {
        const lesson = book.lessons[lessonIndex];
        const { bloom, wordCount } = indexChapter(lesson.markdown);
        chapters.push({
          id: chapters.length,
          bookSlug: book.slug,
          bookTitle: book.title,
          bookTitles: titles[book.slug] ?? {},
          bookLevel: book.level,
          lessonIndex,
          sourceFile: lesson.sourceFile,
          chapterTitle: lesson.title,
          wordCount,
          bloom,
        });
        if (performance.now() - sliceStart > SLICE_MS) {
          await yieldTurn();
          sliceStart = performance.now();
        }
      }
    }
  } catch (error) {
    console.error(`Library sentence index for "${language}" failed:`, error);
    return null;
  }
  return { language, chapters };
}

function start(language: LanguageCode) {
  const existing = states.get(language);
  if (existing) return existing;
  const state = {
    builds: 1,
    index: null as LibraryIndex | null,
    promise: null as unknown as Promise<LibraryIndex | null>,
  };
  state.promise = build(language).then((index) => {
    state.index = index;
    return index;
  });
  states.set(language, state);
  return state;
}

/** The finished index, or null while it builds. The first call starts the one build. */
export function getLibraryIndex(language: string): LibraryIndex | null {
  if (!isValidLanguageCode(language)) return null;
  return start(language).index;
}

export function buildLibraryIndex(language: string): Promise<LibraryIndex | null> {
  if (!isValidLanguageCode(language)) return Promise.resolve(null);
  return start(language).promise;
}

export function libraryIndexBuildCount(language: string): number {
  return states.get(language)?.builds ?? 0;
}

export function resetLibraryIndexes(): void {
  states.clear();
  sentenceCache.clear();
}

/** Chapters whose text may hold every token of at least one pattern. A false positive is possible. */
export function candidateChapters(index: LibraryIndex, patterns: string[][]): Chapter[] {
  const hashed = patterns.map((pattern) => {
    const hashes: number[] = [];
    for (const token of pattern) forEachRun(token, (hash) => hashes.push(hash));
    return hashes;
  });
  if (hashed.every((hashes) => hashes.length === 0)) return [];
  return index.chapters.filter((chapter) =>
    hashed.some(
      (hashes) => hashes.length > 0 && hashes.every((hash) => inBloom(chapter.bloom, hash)),
    ),
  );
}

const MARKDOWN_RULES: Array<[RegExp, string]> = [
  [/!\[[^\]]*\]\([^)]*\)/g, ''],
  [/\[([^\]]*)\]\([^)]*\)/g, '$1'],
  [/`+/g, ''],
  [/\*+/g, ''],
  [/(^|[^\p{L}\p{N}])_+([^_\n]+?)_+(?![\p{L}\p{N}])/gu, '$1$2'],
];

function stripMarkdown(markdown: string): string {
  const paragraphs: string[] = [];
  for (const block of markdown.split(/\n\s*\n/)) {
    const lines = block
      .split('\n')
      .filter((line) => !/^\s*(#|-{3,}\s*$|\*{3,}\s*$)/.test(line))
      .map((line) => line.replace(/^\s*(>\s?)+/, '').replace(/^\s*[-+]\s+/, ''));
    let text = lines.join(' ');
    for (const [pattern, replacement] of MARKDOWN_RULES) text = text.replace(pattern, replacement);
    text = text.replace(/\s+/g, ' ').trim();
    if (text) paragraphs.push(text);
  }
  return paragraphs.join('\n\n');
}

const sentenceCache = new Map<string, ChapterSentences | null>();

/** Sentence offsets of one chapter, read from the shipped file on first use. */
export function chapterSentences(index: LibraryIndex, chapter: Chapter): ChapterSentences | null {
  const cacheKey = `${index.language}:${chapter.id}`;
  if (sentenceCache.has(cacheKey)) {
    const hit = sentenceCache.get(cacheKey)!;
    sentenceCache.delete(cacheKey);
    sentenceCache.set(cacheKey, hit);
    return hit;
  }
  const markdown = loadLibraryLesson(index.language, chapter.bookSlug, chapter.sourceFile);
  let result: ChapterSentences | null = null;
  if (markdown !== null) {
    const pack = getLanguageConfig(index.language);
    const text = stripMarkdown(markdown);
    const starts: number[] = [];
    const ends: number[] = [];
    const words: number[] = [];
    let cursor = 0;
    for (const paragraph of text.split('\n\n')) {
      const paragraphStart = text.indexOf(paragraph, cursor);
      let inner = paragraphStart;
      for (const raw of splitSentences(paragraph, pack)) {
        const sentence = raw.trim();
        if (!sentence) continue;
        const start = text.indexOf(sentence, inner);
        if (start < 0) continue;
        inner = start + sentence.length;
        const count = tokenizeWords(sentence, pack).length;
        if (count < MIN_SENTENCE_WORDS || count > MAX_SENTENCE_WORDS) continue;
        starts.push(start);
        ends.push(inner);
        words.push(count);
      }
      cursor = paragraphStart + paragraph.length;
    }
    result = {
      text,
      count: starts.length,
      starts: Uint32Array.from(starts),
      ends: Uint32Array.from(ends),
      words: Uint16Array.from(words),
    };
  }
  sentenceCache.set(cacheKey, result);
  if (sentenceCache.size > SENTENCE_CACHE_SIZE) {
    sentenceCache.delete(sentenceCache.keys().next().value!);
  }
  return result;
}

export function sentenceAt(sentences: ChapterSentences, i: number): string {
  return sentences.text.slice(sentences.starts[i], sentences.ends[i]);
}
