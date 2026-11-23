import {
  foldWord,
  makeWordSegmentation,
  normalizeText,
  parseStoredSegmentWords,
  splitSentences,
  stripMarkdown,
  stripMarks,
  tokenize,
  tokenizeWords,
  vocabKeys,
  type LanguageConfig,
  type WordSegmentation,
} from './languages';

export const DEFAULT_SEARCH_LIMIT = 50;
export const MAX_SEARCH_LIMIT = 100;
export const DEFAULT_PER_LESSON_CAP = 5;
export const DEFAULT_MAX_SCAN_MS = 150;
export const DEFAULT_MAX_SCANNED_BYTES = 2 * 1024 * 1024;
export const DEFAULT_MAX_SNIPPET_CHARS = 300;
export const MAX_QUERY_CHARS = 200;

export interface SearchableLesson {
  id: string;
  title: string;
  collectionId: string | null;
  collectionTitle: string | null;
  groupId: string | null;
  groupName: string | null;
  textContent: string;
  sourceType: string | null;
  segments: string | null;
  segmentWords: string | null;
}

export interface LessonSearchMatch {
  lessonId: string;
  lessonTitle: string;
  collectionId: string | null;
  collectionTitle: string | null;
  groupId: string | null;
  groupName: string | null;
  snippet: string;
  matchStart: number;
  matchEnd: number;
  /** 0-based occurrence index of this matched sentence core within the lesson. */
  occ: number;
  /** Present for YouTube transcript lessons (0-based cue index). */
  segmentIndex?: number;
  /** Present for YouTube transcript lessons (cue start in milliseconds). */
  startMs?: number;
}

export interface LessonSearchOptions {
  limit?: number;
  perLessonCap?: number;
  maxScanMs?: number;
  maxScannedBytes?: number;
  maxSnippetChars?: number;
  now?: () => number;
}

export interface LessonSearchResult {
  query: string;
  matches: LessonSearchMatch[];
  truncated: boolean;
}

interface CompiledQuery {
  isCjkUnspaced: boolean;
  /** Compact folded query for CJK token-run matching & pre-filtering. */
  cjkCompact: string;
  /** Pre-filter parts for CJK when the user typed spaces inside a query. */
  cjkPrefilterParts: string[];
  /** Folded word tokens for spaced scripts. */
  spacedTokens: string[];
  /** Accepted folded vocab keys for a single-word spaced query (supports clitics/apostrophes). */
  singleWordKeys: Set<string>;
  /** Array copy of singleWordKeys for fast raw-text pre-filtering. */
  singleWordKeyList: string[];
}

interface RawYouTubeSegment {
  start: number;
  end: number;
  text: string;
}

function searchFold(text: string, pack: LanguageConfig): string {
  const folded = foldWord(text, pack);
  return pack.code === 'grc' ? stripMarks(folded) : folded;
}

function compileQuery(trimmedQuery: string, pack: LanguageConfig): CompiledQuery | null {
  if (pack.script.kind === 'cjk-unspaced') {
    const folded = searchFold(trimmedQuery, pack);
    const parts = folded
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const compact = parts.join('');
    if (!compact) return null;
    return {
      isCjkUnspaced: true,
      cjkCompact: compact,
      cjkPrefilterParts: parts,
      spacedTokens: [],
      singleWordKeys: new Set(),
      singleWordKeyList: [],
    };
  }

  const wordTokens = tokenizeWords(trimmedQuery, pack).map((t) => searchFold(t.text, pack));
  if (wordTokens.length === 0) return null;

  const singleWordKeys = new Set<string>();
  if (wordTokens.length === 1) {
    for (const key of vocabKeys(wordTokens[0], pack)) {
      singleWordKeys.add(searchFold(key, pack));
    }
    singleWordKeys.add(wordTokens[0]);
  }

  return {
    isCjkUnspaced: false,
    cjkCompact: '',
    cjkPrefilterParts: [],
    spacedTokens: wordTokens,
    singleWordKeys,
    singleWordKeyList: [...singleWordKeys],
  };
}

/**
 * Fast lesson-level pre-filter over raw text before Markdown stripping,
 * sentence splitting, and tokenization. Uses `searchFold` (which handles
 * NFC, Turkish dotted I, Arabic tashkeel/tatweel/alef, Latin macrons/ligatures,
 * Koine Greek polytonic marks, and apostrophe folding) so it has zero false
 * negatives across all 28 supported packs.
 */
function passesRawPrefilter(
  rawText: string,
  compiled: CompiledQuery,
  pack: LanguageConfig,
): boolean {
  if (!rawText) return false;
  const foldedRaw = searchFold(rawText, pack);
  if (compiled.isCjkUnspaced) {
    if (compiled.cjkPrefilterParts.every((part) => foldedRaw.includes(part))) {
      return true;
    }
    // Inline Markdown markers (e.g. `我**喜欢**读书`) or line wraps can sit
    // between adjacent CJK tokens in raw text. Only fall back when the raw text
    // actually contains markup/newlines and holds every character of the query.
    if (/[*_`[\]\n]/.test(foldedRaw)) {
      for (const ch of compiled.cjkCompact) {
        if (!foldedRaw.includes(ch)) return false;
      }
      return true;
    }
    return false;
  }
  if (compiled.spacedTokens.length === 1) {
    return compiled.singleWordKeyList.some((key) => foldedRaw.includes(key));
  }
  return compiled.spacedTokens.every((token) => foldedRaw.includes(token));
}

function findMatchInSentence(
  sentence: string,
  compiled: CompiledQuery,
  pack: LanguageConfig,
  segmentation: WordSegmentation | null,
): { start: number; end: number } | null {
  const tokens = tokenize(sentence, pack, segmentation).filter((t) => t.isWord);
  if (tokens.length === 0) return null;

  if (compiled.isCjkUnspaced) {
    const needle = compiled.cjkCompact;
    for (let i = 0; i < tokens.length; i++) {
      let joined = '';
      for (let end = i; end < tokens.length; end++) {
        if (end > i) {
          // Do not bridge non-whitespace punctuation (e.g. "喜，欢") into one match.
          const gap = sentence.slice(tokens[end - 1].end, tokens[end].start);
          if (gap.trim().length > 0) break;
        }
        joined += searchFold(tokens[end].text, pack);
        if (joined === needle) {
          return { start: tokens[i].start, end: tokens[end].end };
        }
        if (joined.length >= needle.length) break;
      }
    }
    return null;
  }

  if (compiled.spacedTokens.length === 1) {
    for (const token of tokens) {
      const foldedToken = searchFold(token.text, pack);
      if (compiled.singleWordKeys.has(foldedToken)) {
        return { start: token.start, end: token.end };
      }
      if (pack.morphology) {
        const keys = vocabKeys(token.text, pack);
        for (const key of keys) {
          if (compiled.singleWordKeys.has(searchFold(key, pack))) {
            return { start: token.start, end: token.end };
          }
        }
      }
    }
    return null;
  }

  const targetLen = compiled.spacedTokens.length;
  if (tokens.length < targetLen) return null;
  const foldedTokens = tokens.map((t) => searchFold(t.text, pack));
  outer: for (let i = 0; i <= foldedTokens.length - targetLen; i++) {
    for (let j = 0; j < targetLen; j++) {
      if (foldedTokens[i + j] !== compiled.spacedTokens[j]) continue outer;
    }
    return { start: tokens[i].start, end: tokens[i + targetLen - 1].end };
  }
  return null;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/**
 * Window a matched sentence to at most `maxChars` UTF-16 code units centered
 * around `[matchStart, matchEnd)` and return adjusted match offsets.
 */
export function windowSnippet(
  sentence: string,
  matchStart: number,
  matchEnd: number,
  maxChars: number = DEFAULT_MAX_SNIPPET_CHARS,
): { snippet: string; matchStart: number; matchEnd: number } {
  const safeStart = Math.max(0, Math.min(matchStart, sentence.length));
  const safeEnd = Math.max(safeStart, Math.min(matchEnd, sentence.length));
  if (sentence.length <= maxChars) {
    return { snippet: sentence, matchStart: safeStart, matchEnd: safeEnd };
  }

  const budget = Math.max(1, maxChars - 2);
  const matchLen = safeEnd - safeStart;
  let start: number;
  let end: number;

  if (matchLen >= budget) {
    start = safeStart;
    end = Math.min(sentence.length, start + budget);
  } else {
    const padLeft = Math.floor((budget - matchLen) / 2);
    start = Math.max(0, safeStart - padLeft);
    end = Math.min(sentence.length, start + budget);
    if (end === sentence.length) {
      start = Math.max(0, end - budget);
    }
  }

  // Snap window edges to nearby spaces so words are not chopped in half when possible.
  if (start > 0) {
    const snapLimit = Math.min(safeStart, start + 20);
    const spaceIdx = sentence.indexOf(' ', start);
    if (spaceIdx !== -1 && spaceIdx < snapLimit && spaceIdx + 1 <= safeStart) {
      start = spaceIdx + 1;
    }
  }
  if (end < sentence.length) {
    const snapFloor = Math.max(safeEnd, end - 20);
    const spaceIdx = sentence.lastIndexOf(' ', end - 1);
    if (spaceIdx !== -1 && spaceIdx >= snapFloor && spaceIdx >= safeEnd) {
      end = spaceIdx;
    }
  }

  if (start > 0 && isLowSurrogate(sentence.charCodeAt(start)) && start + 1 <= safeStart) {
    start += 1;
  }
  if (end < sentence.length && end > safeEnd && isHighSurrogate(sentence.charCodeAt(end - 1))) {
    end -= 1;
  }

  while (start < safeStart && /\s/.test(sentence[start])) start += 1;
  while (end > safeEnd && /\s/.test(sentence[end - 1])) end -= 1;

  const hasPrefix = start > 0;
  const hasSuffix = end < sentence.length;
  const core = sentence.slice(start, end);
  const snippet = `${hasPrefix ? '…' : ''}${core}${hasSuffix ? '…' : ''}`;
  const prefixOffset = hasPrefix ? 1 : 0;
  const adjStart = Math.max(prefixOffset, safeStart - start + prefixOffset);
  const maxAdjEnd = snippet.length - (hasSuffix ? 1 : 0);
  const adjEnd = Math.min(maxAdjEnd, Math.max(adjStart, safeEnd - start + prefixOffset));

  return { snippet, matchStart: adjStart, matchEnd: adjEnd };
}

function parseYouTubeSegments(lesson: SearchableLesson): RawYouTubeSegment[] | null {
  if (lesson.sourceType !== 'youtube' || !lesson.segments) return null;
  try {
    const parsed = JSON.parse(lesson.segments) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const out: RawYouTubeSegment[] = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as { start?: unknown }).start === 'number' &&
        Number.isFinite((item as { start: number }).start) &&
        typeof (item as { text?: unknown }).text === 'string'
      ) {
        const start = (item as { start: number }).start;
        const rawEnd = (item as { end?: unknown }).end;
        out.push({
          start,
          end: typeof rawEnd === 'number' && Number.isFinite(rawEnd) ? rawEnd : start,
          text: (item as { text: string }).text,
        });
      }
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

function stripEllipsesForKey(snippet: string): string {
  return snippet.replace(/^…+/, '').replace(/…+$/, '').replace(/\s+/g, ' ').trim();
}

function isWindowTrimmed(snippet: string): boolean {
  return snippet.startsWith('…') || snippet.endsWith('…');
}

/**
 * Slice a UTF-8-bounded prefix in O(maxBytes) without measuring the full length
 * of an arbitrarily huge string (`utf8Bytes(s) >= s.length` always holds in UTF-16).
 */
function sliceUtf8Prefix(text: string, maxBytes: number): { slice: string; trimmed: boolean } {
  if (maxBytes <= 0) return { slice: '', trimmed: text.length > 0 };
  // Fast O(1) upper bound: every UTF-16 code unit encodes to at most 3 UTF-8 bytes
  // (surrogate pairs: 2 code units -> 4 bytes = 2 bytes/unit).
  if (text.length * 3 <= maxBytes) return { slice: text, trimmed: false };

  let end = Math.min(text.length, maxBytes);
  if (end < text.length) {
    const prev = text.charCodeAt(end - 1);
    if (prev >= 0xd800 && prev <= 0xdbff) end -= 1;
  }
  let candidate = text.slice(0, end);
  const wasLengthCapped = end < text.length;
  if (!wasLengthCapped && Buffer.byteLength(candidate, 'utf8') <= maxBytes) {
    return { slice: candidate, trimmed: false };
  }

  // Shrink via binary search until UTF-8 byte length fits maxBytes.
  let lo = 0;
  let hi = candidate.length;
  while (lo < hi) {
    let mid = (lo + hi + 1) >> 1;
    if (mid > 0) {
      const ch = candidate.charCodeAt(mid - 1);
      if (ch >= 0xd800 && ch <= 0xdbff) mid -= 1;
    }
    if (mid <= lo) break;
    if (Buffer.byteLength(candidate.slice(0, mid), 'utf8') <= maxBytes) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  let cut = lo;
  // Prefer breaking cleanly on a paragraph or whitespace boundary near the end.
  const searchFloor = Math.max(0, cut - 1024);
  const paraBreak = candidate.lastIndexOf('\n\n', cut);
  if (paraBreak > searchFloor) {
    cut = paraBreak;
  } else {
    const lineBreak = candidate.lastIndexOf('\n', cut);
    if (lineBreak > searchFloor) {
      cut = lineBreak;
    } else {
      const spaceBreak = candidate.lastIndexOf(' ', cut);
      if (spaceBreak > searchFloor) cut = spaceBreak;
    }
  }
  if (cut > 0) {
    const ch = candidate.charCodeAt(cut - 1);
    if (ch >= 0xd800 && ch <= 0xdbff) cut -= 1;
  }
  candidate = candidate.slice(0, cut);
  return { slice: candidate, trimmed: true };
}

export function searchLessonsInCorpus(
  lessons: Iterable<SearchableLesson>,
  query: string,
  pack: LanguageConfig,
  options: LessonSearchOptions = {},
): LessonSearchResult {
  const trimmedQuery = normalizeText(query).trim();
  const limit = Math.max(1, Math.min(MAX_SEARCH_LIMIT, options.limit ?? DEFAULT_SEARCH_LIMIT));
  const perLessonCap = Math.max(1, options.perLessonCap ?? DEFAULT_PER_LESSON_CAP);
  const maxScanMs = Math.max(1, options.maxScanMs ?? DEFAULT_MAX_SCAN_MS);
  const maxScannedBytes = Math.max(1, options.maxScannedBytes ?? DEFAULT_MAX_SCANNED_BYTES);
  const maxSnippetChars = Math.max(20, options.maxSnippetChars ?? DEFAULT_MAX_SNIPPET_CHARS);
  const now = options.now ?? (() => performance.now());

  if (!trimmedQuery) {
    return { query: '', matches: [], truncated: false };
  }

  const compiled = compileQuery(trimmedQuery, pack);
  if (!compiled) {
    return { query: trimmedQuery, matches: [], truncated: false };
  }

  const matches: LessonSearchMatch[] = [];
  let truncated = false;
  let scannedBytes = 0;
  let lessonsScanned = 0;
  const startedAt = now();

  for (const lesson of lessons) {
    if (now() - startedAt >= maxScanMs) {
      truncated = true;
      break;
    }

    const remainingBytes = maxScannedBytes - scannedBytes;
    const ytSegments = parseYouTubeSegments(lesson);
    let boundedSegments: RawYouTubeSegment[] | null = null;
    let rawSource: string;

    if (ytSegments) {
      let segBytes = 0;
      const kept: RawYouTubeSegment[] = [];
      let over = false;
      for (const seg of ytSegments) {
        const b = Buffer.byteLength(seg.text, 'utf8');
        if (lessonsScanned > 0 && segBytes + b > remainingBytes) {
          over = true;
          break;
        }
        if (lessonsScanned === 0 && kept.length > 0 && segBytes + b > maxScannedBytes) {
          over = true;
          break;
        }
        segBytes += b;
        kept.push(seg);
      }
      if (lessonsScanned > 0 && over) {
        truncated = true;
        break;
      }
      if (over) truncated = true;
      boundedSegments = kept;
      rawSource = kept.map((seg) => seg.text).join('\n');
      scannedBytes += Math.min(segBytes, maxScannedBytes);
    } else {
      const fullText = lesson.textContent ?? '';
      // O(1) lower-bound reject before UTF-8 byte measurement (utf8Bytes >= length).
      if (lessonsScanned > 0 && fullText.length > remainingBytes) {
        truncated = true;
        break;
      }
      const budget = lessonsScanned === 0 ? maxScannedBytes : remainingBytes;
      const { slice, trimmed } = sliceUtf8Prefix(fullText, budget);
      if (trimmed) {
        truncated = true;
        if (lessonsScanned > 0) break;
      }
      rawSource = slice;
      scannedBytes += trimmed ? budget : Buffer.byteLength(slice, 'utf8');
    }

    lessonsScanned += 1;

    if (!passesRawPrefilter(rawSource, compiled, pack)) {
      continue;
    }

    const segmentation =
      pack.script.kind === 'cjk-unspaced'
        ? makeWordSegmentation(parseStoredSegmentWords(lesson.segmentWords))
        : null;
    const seenExactCounts = new Map<string, number>();
    const priorFoldedSentences: string[] = [];
    let lessonMatches = 0;

    if (boundedSegments) {
      for (let segmentIndex = 0; segmentIndex < boundedSegments.length; segmentIndex++) {
        if (now() - startedAt >= maxScanMs) {
          truncated = true;
          return { query: trimmedQuery, matches, truncated };
        }
        const seg = boundedSegments[segmentIndex];
        const cleaned = normalizeText(seg.text).replace(/\s+/g, ' ').trim();
        if (!cleaned) continue;
        const foldedCleaned = searchFold(cleaned, pack);
        const found = findMatchInSentence(cleaned, compiled, pack, segmentation);
        if (!found) {
          priorFoldedSentences.push(foldedCleaned);
          continue;
        }

        if (matches.length >= limit) {
          truncated = true;
          return { query: trimmedQuery, matches, truncated };
        }

        const windowed = windowSnippet(cleaned, found.start, found.end, maxSnippetChars);
        const coreKey = searchFold(stripEllipsesForKey(windowed.snippet), pack);
        const occ = isWindowTrimmed(windowed.snippet)
          ? priorFoldedSentences.reduce((n, prev) => (prev.includes(coreKey) ? n + 1 : n), 0)
          : (seenExactCounts.get(coreKey) ?? 0);
        seenExactCounts.set(foldedCleaned, (seenExactCounts.get(foldedCleaned) ?? 0) + 1);
        priorFoldedSentences.push(foldedCleaned);

        matches.push({
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          collectionId: lesson.collectionId,
          collectionTitle: lesson.collectionTitle,
          groupId: lesson.groupId,
          groupName: lesson.groupName,
          snippet: windowed.snippet,
          matchStart: windowed.matchStart,
          matchEnd: windowed.matchEnd,
          occ,
          segmentIndex,
          startMs: Math.max(0, Math.round(seg.start * 1000)),
        });

        lessonMatches += 1;
        if (lessonMatches >= perLessonCap) break;
      }
      continue;
    }

    const stripped = stripMarkdown(rawSource, { keepHeadings: true });
    for (const paragraph of stripped.split('\n\n')) {
      if (now() - startedAt >= maxScanMs) {
        truncated = true;
        return { query: trimmedQuery, matches, truncated };
      }
      if (!paragraph) continue;

      for (const rawSentence of splitSentences(paragraph, pack)) {
        const sentence = normalizeText(rawSentence).replace(/\s+/g, ' ').trim();
        if (!sentence) continue;
        const foldedSentence = searchFold(sentence, pack);
        const found = findMatchInSentence(sentence, compiled, pack, segmentation);
        if (!found) {
          seenExactCounts.set(foldedSentence, (seenExactCounts.get(foldedSentence) ?? 0) + 1);
          priorFoldedSentences.push(foldedSentence);
          continue;
        }

        if (matches.length >= limit) {
          truncated = true;
          return { query: trimmedQuery, matches, truncated };
        }

        const windowed = windowSnippet(sentence, found.start, found.end, maxSnippetChars);
        const coreKey = searchFold(stripEllipsesForKey(windowed.snippet), pack);
        const occ = isWindowTrimmed(windowed.snippet)
          ? priorFoldedSentences.reduce((n, prev) => (prev.includes(coreKey) ? n + 1 : n), 0)
          : (seenExactCounts.get(coreKey) ?? 0);
        seenExactCounts.set(foldedSentence, (seenExactCounts.get(foldedSentence) ?? 0) + 1);
        priorFoldedSentences.push(foldedSentence);

        matches.push({
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          collectionId: lesson.collectionId,
          collectionTitle: lesson.collectionTitle,
          groupId: lesson.groupId,
          groupName: lesson.groupName,
          snippet: windowed.snippet,
          matchStart: windowed.matchStart,
          matchEnd: windowed.matchEnd,
          occ,
        });

        lessonMatches += 1;
        if (lessonMatches >= perLessonCap) break;
      }
      if (lessonMatches >= perLessonCap) break;
    }
  }

  return { query: trimmedQuery, matches, truncated };
}
