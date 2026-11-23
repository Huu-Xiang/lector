import { isValidElement, type ReactNode, type ReactElement } from 'react';
import {
  tokenize,
  snapToWordBoundaries as snapOffsetsToWordBoundaries,
  foldWord,
  parseStoredSegmentWords,
  type LanguageConfig,
  type Token,
  type WordSegmentation,
} from '@/lib/languages';

/**
 * Read `lessons.segmentWords` (#289 4.2). A malformed value degrades to null
 * rather than throwing: the reader can always fall back to `Intl.Segmenter`, so
 * one bad row must not blank the page.
 */
export function parseSegmentWords(value: string | null | undefined): string[] | null {
  // Delegates to the shared implementation so the API and the reader cannot
  // disagree about what a stored segmentation means.
  return parseStoredSegmentWords(value);
}

// Non-content elements skipped when extracting readable text from the DOM:
// `<rt>`/`<rp>` hold ruby annotations (#289 4.4), and `<button>` holds
// interactive chrome such as transcript timestamp seek buttons (`TranscriptReader`).
const SKIP_TAGS = new Set(['RT', 'RP', 'BUTTON']);

// Block elements whose cloned boundaries separate words in spaced scripts
// (e.g. dragging across YouTube transcript cues or markdown paragraphs).
const BLOCK_TAGS = new Set(['DIV', 'P', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

const BLOCK_SELECTOR = 'p, li, blockquote, h1, h2, h3, h4, h5, h6';

// Numeric nodeType constants rather than `Node.ELEMENT_NODE`. The `Node` global
// does not exist outside a browser, so referencing it would throw under the
// node-environment unit tests and during any server render.
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

function isBlockElement(node: Node): boolean {
  if (node.nodeType !== ELEMENT_NODE) return false;
  const tagName = (node as Element).tagName;
  return typeof tagName === 'string' && BLOCK_TAGS.has(tagName.toUpperCase());
}

/**
 * The text of a DOM subtree, excluding ruby annotations and button chrome.
 *
 * `textContent` interleaves them. Measured in Chromium on
 * `<ruby>我<rt>wǒ</rt></ruby><ruby>喜欢<rt>xǐhuan</rt></ruby>`, `textContent`
 * gives "我wǒ喜欢xǐhuan" where the sentence is "我喜欢". That string is not
 * cosmetic: `findSentence` feeds it to `wordPanel.sentence`, which is persisted
 * to `vocab.sentence` and later validated by the Anki cloze builder, so an
 * interleaved read corrupts saved vocabulary and fails the export.
 *
 * When `spaced` is true (default), adjacent cloned block boundaries get a
 * single space separator so cross-cue and cross-paragraph selections preserve
 * word separation; pass `false` for unspaced CJK scripts (`cjk-unspaced`).
 */
export function readableText(node: Node, spaced = true): string {
  if (node.nodeType === TEXT_NODE) return node.textContent ?? '';
  if (node.nodeType === ELEMENT_NODE) {
    const tagName = (node as Element).tagName;
    if (typeof tagName === 'string' && SKIP_TAGS.has(tagName.toUpperCase())) {
      return '';
    }
  }
  if (!node.childNodes) return '';
  let out = '';
  let prevWasBlock = false;
  for (const child of Array.from(node.childNodes)) {
    const part = readableText(child, spaced);
    if (!part) continue;
    const childIsBlock = isBlockElement(child);
    if (
      spaced &&
      out.length > 0 &&
      (prevWasBlock || childIsBlock) &&
      !/\s$/.test(out) &&
      !/^\s/.test(part)
    ) {
      out += ' ';
    }
    out += part;
    prevWasBlock = childIsBlock;
  }
  return out;
}

/**
 * A Range's text, excluding ruby annotations and button chrome.
 *
 * `range.toString()` cannot be used: unlike a selection it ignores
 * `user-select: none`, so the CSS guard that keeps annotations and timestamp
 * buttons out of a copy does NOT keep them out of this. Verified in Chromium —
 * with `rt { user-select: none }`, `selection.toString()` returns "我喜欢读书。"
 * while `range.toString()` still returns "我wǒ喜欢xǐhuan读书dúshū。".
 *
 * `cloneContents` is a detached fragment, so walking it cannot disturb the live
 * selection or the rendered DOM.
 */
export function readableRangeText(range: Range, spaced = true): string {
  return readableText(range.cloneContents(), spaced);
}

// Expand a selection to full word boundaries. DOM wrapper around the pure
// offset-based snapper in languages/tokenizer — per-pack so it follows the
// active script instead of hardcoded Latin ranges (#289).
export function snapToWordBoundaries(
  selection: Selection,
  pack: LanguageConfig,
  words?: WordSegmentation | null,
): string {
  const range = selection.getRangeAt(0);

  const startContainer = range.startContainer;
  if (startContainer.nodeType === TEXT_NODE) {
    const text = startContainer.textContent || '';
    const { start } = snapOffsetsToWordBoundaries(
      text,
      range.startOffset,
      range.startOffset,
      pack,
      words,
    );
    range.setStart(startContainer, start);
  }

  const endContainer = range.endContainer;
  if (endContainer.nodeType === TEXT_NODE) {
    const text = endContainer.textContent || '';
    const { end } = snapOffsetsToWordBoundaries(
      text,
      range.endOffset,
      range.endOffset,
      pack,
      words,
    );
    range.setEnd(endContainer, end);
  }

  const spaced = pack.script.kind !== 'cjk-unspaced';
  return readableRangeText(range, spaced).replace(/\s+/g, ' ').trim();
}

function asElement(node: Node | null): HTMLElement | null {
  if (!node) return null;
  return node.nodeType === ELEMENT_NODE
    ? (node as HTMLElement)
    : (node.parentElement as HTMLElement | null);
}

/**
 * Resolve an element inside a readable text block (`<p>`, `<li>`, etc.) for
 * sentence extraction on mouse drag selection.
 *
 * When a drag begins outside a `<p>` (for example on a transcript segment
 * container or timestamp button), `selection.anchorNode?.parentElement` has no
 * ancestor block, so fall back to the first block intersected by the range.
 */
export function findSelectionAnchorElement(selection: Selection, range: Range): HTMLElement | null {
  const anchor = asElement(selection.anchorNode);
  if (anchor?.closest?.(BLOCK_SELECTOR)) return anchor;

  const start = asElement(range.startContainer);
  if (start?.closest?.(BLOCK_SELECTOR)) return start;

  const ancestor = asElement(range.commonAncestorContainer);
  if (ancestor) {
    const ancestorBlock = ancestor.closest?.(BLOCK_SELECTOR) as HTMLElement | null;
    if (ancestorBlock) return ancestorBlock;
    if (
      typeof ancestor.querySelectorAll === 'function' &&
      typeof range.intersectsNode === 'function'
    ) {
      for (const block of Array.from(ancestor.querySelectorAll<HTMLElement>(BLOCK_SELECTOR))) {
        if (range.intersectsNode(block)) return block;
      }
    }
  }

  const end = asElement(range.endContainer);
  if (end?.closest?.(BLOCK_SELECTOR)) return end;

  return null;
}

export interface TextPart {
  text: string;
  isWord: boolean;
}

/**
 * Split a string into alternating word / non-word parts (pure). Thin wrapper
 * over the shared per-pack tokenizer (#289) — the word shape lives in
 * languages/tokenizer, not here.
 */
export function splitWords(
  text: string,
  pack: LanguageConfig,
  words?: WordSegmentation | null,
): TextPart[] {
  return tokenize(text, pack, words).map((t: Token) => ({ text: t.text, isWord: t.isWord }));
}

/**
 * Collect a react-markdown block's words in document order, splitting each
 * string leaf exactly the way the renderer does — including words nested inside
 * inline elements (<strong>/<em>/<a>/…). The resulting order matches the spans
 * produced during rendering, so phrase-highlight indices line up.
 *
 * `words` must be the same segmentation the renderer uses, or the collected
 * order stops matching the rendered spans and phrase highlighting lands on the
 * wrong words.
 */
export function collectWords(
  children: ReactNode,
  pack: LanguageConfig,
  words?: WordSegmentation | null,
): string[] {
  if (typeof children === 'string') {
    return splitWords(children, pack, words)
      .filter((p) => p.isWord)
      .map((p) => p.text);
  }
  if (Array.isArray(children)) {
    return children.flatMap((child) => collectWords(child, pack, words));
  }
  if (isValidElement(children)) {
    return collectWords(
      (children as ReactElement<{ children?: ReactNode }>).props.children,
      pack,
      words,
    );
  }
  return [];
}

/**
 * Indices (into a block's word list) covered by the currently highlighted
 * phrase. Matches the first contiguous run, comparing folded word keys
 * (case-insensitive; script-aware via foldWord). Empty phrase or no match →
 * empty set. `phrase` entries are already folded by the caller.
 */
export function computePhraseHighlightSet(
  blockWords: string[],
  phrase: string[],
  pack: LanguageConfig,
): Set<number> {
  const set = new Set<number>();
  if (phrase.length === 0 || phrase.length > blockWords.length) return set;
  for (let i = 0; i <= blockWords.length - phrase.length; i++) {
    let matches = true;
    for (let j = 0; j < phrase.length; j++) {
      if (foldWord(blockWords[i + j], pack) !== phrase[j]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      for (let j = 0; j < phrase.length; j++) set.add(i + j);
      return set;
    }
  }
  return set;
}

/**
 * The inclusive run between two endpoints of an ordered list, in that order.
 *
 * `spans` must hold a block's word spans in document order, so a drag that ran
 * backwards returns the same run as the forward drag. An endpoint that is not
 * in the list returns nothing.
 */
export function wordSpansBetween<T>(anchor: T, focus: T, spans: readonly T[]): T[] {
  const start = spans.indexOf(anchor);
  const end = spans.indexOf(focus);
  if (start < 0 || end < 0) return [];
  return start <= end ? spans.slice(start, end + 1) : spans.slice(end, start + 1);
}
