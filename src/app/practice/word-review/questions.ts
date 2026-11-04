import type { LanguageConfig } from '@/lib/languages';
import { resolveClozeTokens } from '@/lib/languages';
import { isComposing } from '@/lib/keyboard';
import { splitTrailingPunctuation } from '@/lib/words';
import type { RecognitionAnswer, ReviewItem, ReviewQuestionType, SentenceBlank } from '@/types';
import { createBlankedSentence, normalize } from '../utils';

export interface FillInQuestion {
  blanked: string;
  options: string[];
  correctIndex: number;
}

const FILL_IN_OPTIONS = 4;

function blankIndex(item: ReviewItem, pack?: LanguageConfig): number {
  if (!item.sentence || item.type !== 'word') return -1;
  const target = normalize(item.word, pack);
  const tokens = resolveClozeTokens(item.sentence, null, pack);
  return tokens.findIndex(
    (token) => normalize(splitTrailingPunctuation(token)[0], pack) === target,
  );
}

const BLANK = '_____';

export function renderBlank(sentence: string, blank: SentenceBlank | undefined): string | null {
  if (!blank) return null;
  const { start, end } = blank;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (start < 0 || end <= start || end > sentence.length) return null;
  const span = sentence.slice(start, end);
  const [core, punct] = splitTrailingPunctuation(span);
  const lead = span.slice(0, span.length - core.length - punct.length);
  return sentence.slice(0, start) + lead + BLANK + punct + sentence.slice(end);
}

export function blankSentence(item: ReviewItem, pack?: LanguageConfig): string | null {
  const fromServer = renderBlank(item.sentence, item.sentenceBlank);
  if (fromServer !== null) return fromServer;
  const index = blankIndex(item, pack);
  if (index < 0) return null;
  const tokens = resolveClozeTokens(item.sentence, null, pack);
  return createBlankedSentence(item.sentence, index, tokens, pack);
}

function seededOrder(seed: string, count: number): number[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export function buildFillInQuestion(
  item: ReviewItem,
  roundItems: ReviewItem[],
  pack?: LanguageConfig,
): FillInQuestion | null {
  const blanked = blankSentence(item, pack);
  if (blanked === null) return null;
  const seen = new Set([normalize(item.word, pack)]);
  const others: string[] = [];
  for (const other of roundItems) {
    if (other.type !== 'word') continue;
    const key = normalize(other.word, pack);
    if (seen.has(key)) continue;
    seen.add(key);
    others.push(other.word);
  }
  if (others.length < FILL_IN_OPTIONS - 1) return null;
  const pool = [item.word, ...others.slice(0, FILL_IN_OPTIONS - 1)];
  const order = seededOrder(item.cardId, pool.length);
  const options = order.map((i) => pool[i]);
  return { blanked, options, correctIndex: options.indexOf(item.word) };
}

export function effectiveQuestionType(
  item: ReviewItem,
  roundItems: ReviewItem[],
  audio = false,
  pack?: LanguageConfig,
): ReviewQuestionType {
  switch (item.questionType) {
    case 'choose_meaning':
      return item.choices?.includes(item.translation) ? 'choose_meaning' : 'recognition';
    case 'fill_in':
      return buildFillInQuestion(item, roundItems, pack) ? 'fill_in' : 'recognition';
    case 'dictation':
      if (audio && item.sentence) return 'dictation';
      return blankSentence(item, pack) !== null ? 'typed_fill_in' : 'recognition';
    case 'typed_fill_in':
      return blankSentence(item, pack) !== null ? 'typed_fill_in' : 'recognition';
    default:
      return 'recognition';
  }
}

export function recognitionKeyAction(
  key: string,
  revealed: boolean,
): 'reveal' | RecognitionAnswer | null {
  if (!revealed) return key === ' ' || key === 'Enter' ? 'reveal' : null;
  if (key === '1') return 'dont_know';
  if (key === '2') return 'fuzzy';
  if (key === '3') return 'know';
  return null;
}

interface KeyLike {
  key: string;
  isComposing?: boolean;
  keyCode?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  target?: unknown;
}

export function shouldIgnoreKey(event: KeyLike): boolean {
  if (isComposing(event)) return true;
  if (event.metaKey || event.ctrlKey || event.altKey) return true;
  const target = event.target as { closest?: (selector: string) => unknown } | null | undefined;
  if (!target || typeof target.closest !== 'function') return false;
  const activates = event.key === ' ' || event.key === 'Enter';
  return !!target.closest(
    activates ? 'input, textarea, select, a, button' : 'input, textarea, select, a',
  );
}
