import { foldWord, normalizeText, stripMarks, type LanguageConfig } from '@/lib/languages';

export const CONCORDANCE_JUMP_STORAGE_KEY = 'readfox-concordance-jump';

export interface ConcordanceJumpPayload {
  lessonId: string;
  q: string;
  sentence: string;
  occ: number;
  segmentIndex?: number;
}

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const SKIP_TAGS = new Set(['RT', 'RP', 'BUTTON']);

/**
 * Build a reader jump URL carrying only opaque coordinates (`?jump=1` plus an
 * optional non-negative integer `&segment=N`), never leaking raw sentence text
 * into URLs, access logs, or error telemetry.
 */
export function buildConcordanceJumpHref(lessonId: string, segmentIndex?: number): string {
  const base = `/read/${encodeURIComponent(lessonId)}?jump=1`;
  if (
    typeof segmentIndex === 'number' &&
    Number.isInteger(segmentIndex) &&
    segmentIndex >= 0
  ) {
    return `${base}&segment=${segmentIndex}`;
  }
  return base;
}

/** Strictly parse a non-negative integer `?segment=` parameter (`^\d+$`). */
export function parseValidatedSegmentParam(raw: string | null | undefined): number | null {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

/** Fast check used before/during initial reader mount to suppress saved scroll restore. */
export function hasConcordanceJumpInSearch(search: string): boolean {
  if (!search) return false;
  const params = new URLSearchParams(search);
  return params.get('jump') === '1' || parseValidatedSegmentParam(params.get('segment')) !== null;
}

function defaultSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function stashConcordanceJump(
  payload: ConcordanceJumpPayload,
  storage: Pick<Storage, 'setItem'> | null = defaultSessionStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(CONCORDANCE_JUMP_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Private browsing or quota limits — navigation still works without highlight state.
  }
}

function parseStoredPayload(raw: string | null): ConcordanceJumpPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.lessonId !== 'string' || !parsed.lessonId) return null;
    const q = typeof parsed.q === 'string' ? parsed.q : '';
    const sentence = typeof parsed.sentence === 'string' ? parsed.sentence : '';
    const occ =
      typeof parsed.occ === 'number' && Number.isInteger(parsed.occ) && parsed.occ >= 0
        ? parsed.occ
        : 0;
    const seg =
      typeof parsed.segmentIndex === 'number' &&
      Number.isInteger(parsed.segmentIndex) &&
      parsed.segmentIndex >= 0
        ? parsed.segmentIndex
        : undefined;
    return {
      lessonId: parsed.lessonId,
      q,
      sentence,
      occ,
      ...(seg !== undefined ? { segmentIndex: seg } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Consume the one-shot concordance jump handoff for `lessonId` from URL search
 * params + `sessionStorage`. Only removes the stored payload when it matches
 * `lessonId`, so an intermediate navigation never discards another lesson's jump.
 */
export function consumeConcordanceJump(
  lessonId: string,
  search: string,
  storage: Pick<Storage, 'getItem' | 'removeItem'> | null = defaultSessionStorage(),
): ConcordanceJumpPayload | null {
  const params = new URLSearchParams(search);
  const jumpFlag = params.get('jump') === '1';
  const urlSegment = parseValidatedSegmentParam(params.get('segment'));
  if (!jumpFlag && urlSegment === null) return null;

  let stored: ConcordanceJumpPayload | null = null;
  if (storage) {
    try {
      const candidate = parseStoredPayload(storage.getItem(CONCORDANCE_JUMP_STORAGE_KEY));
      if (candidate && candidate.lessonId === lessonId) {
        storage.removeItem(CONCORDANCE_JUMP_STORAGE_KEY);
        stored = candidate;
      }
    } catch {
      stored = null;
    }
  }

  if (stored) {
    const segmentIndex = urlSegment !== null ? urlSegment : stored.segmentIndex;
    return {
      ...stored,
      ...(segmentIndex !== undefined ? { segmentIndex } : {}),
    };
  }

  if (urlSegment !== null) {
    return {
      lessonId,
      q: '',
      sentence: '',
      occ: 0,
      segmentIndex: urlSegment,
    };
  }

  return null;
}

export function normalizeJumpText(text: string): string {
  return normalizeText(text).replace(/\s+/g, ' ').trim();
}

function foldForJump(text: string, pack: LanguageConfig): string {
  const folded = foldWord(normalizeJumpText(text), pack);
  return pack.code === 'grc' ? stripMarks(folded) : folded;
}

function collectBlockText(node: Node): string {
  if (node.nodeType === TEXT_NODE) return node.textContent ?? '';
  if (node.nodeType === ELEMENT_NODE) {
    const tagName = (node as Element).tagName;
    if (typeof tagName === 'string') {
      const upper = tagName.toUpperCase();
      if (upper === 'BR') return ' ';
      if (SKIP_TAGS.has(upper)) return '';
    }
  }
  if (!node.childNodes) return '';
  let out = '';
  for (const child of Array.from(node.childNodes)) {
    out += collectBlockText(child);
  }
  return out;
}

/**
 * Extract normalized visible text from a rendered reader block, treating `<br>`
 * (from `remarkBreaks`) as a space and skipping ruby annotations/buttons.
 */
export function readableBlockText(node: Node): string {
  return normalizeJumpText(collectBlockText(node));
}

function stripSnippetEllipses(snippet: string): string {
  return normalizeJumpText(snippet.replace(/^…+/, '').replace(/…+$/, ''));
}

/**
 * Locate the target rendered block matching a concordance jump's normalized
 * sentence snippet and 0-based `occ` occurrence index. Falls back cleanly to
 * the last matching occurrence (or folded query match) if the lesson was
 * slightly edited after search.
 */
export function findMatchingBlockId(
  blocks: ReadonlyArray<{ blockId: number; text: string }>,
  target: Pick<ConcordanceJumpPayload, 'sentence' | 'q' | 'occ'>,
  pack: LanguageConfig,
): number | null {
  if (blocks.length === 0) return null;
  const occ = Math.max(0, target.occ);

  const needleRaw = stripSnippetEllipses(target.sentence);
  if (needleRaw) {
    const foldedNeedle = foldForJump(needleRaw, pack);
    if (foldedNeedle) {
      let seen = 0;
      let lastMatch: number | null = null;
      for (const block of blocks) {
        const haystack = foldForJump(block.text, pack);
        if (!haystack) continue;
        let pos = 0;
        while (pos <= haystack.length - foldedNeedle.length) {
          const idx = haystack.indexOf(foldedNeedle, pos);
          if (idx === -1) break;
          lastMatch = block.blockId;
          if (seen === occ) return block.blockId;
          seen += 1;
          pos = idx + Math.max(1, foldedNeedle.length);
        }
      }
      if (lastMatch !== null) return lastMatch;
    }
  }

  const foldedQuery = target.q ? foldForJump(target.q, pack) : '';
  if (foldedQuery) {
    let seen = 0;
    let lastMatch: number | null = null;
    for (const block of blocks) {
      const haystack = foldForJump(block.text, pack);
      if (!haystack || !haystack.includes(foldedQuery)) continue;
      lastMatch = block.blockId;
      if (seen === occ) return block.blockId;
      seen += 1;
    }
    if (lastMatch !== null) return lastMatch;
  }

  return null;
}
