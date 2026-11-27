import { WordState } from '@/types';

export const WORD_HIGHLIGHT_MODES = ['saved', 'smart', 'clean'] as const;
export type WordHighlightMode = (typeof WORD_HIGHLIGHT_MODES)[number];

export function isWordHighlightMode(value: unknown): value is WordHighlightMode {
  return typeof value === 'string' && (WORD_HIGHLIGHT_MODES as readonly string[]).includes(value);
}

// Calm paper-wash highlighting: never draws heavy solid underlines that collide
// with web links or cut through descenders. Unfamiliar saved words get a soft
// warm ochre wash that fades out as familiarity grows, disappearing by level4.
// Dedicated --w-wash-l* tokens ensure legibility in both light and dark modes.
const paperWash = (level: 'l1' | 'l2' | 'l3') => `bg-[var(--w-wash-${level})]`;

export const stateClasses: Record<WordState, string> = {
  new: '',
  level1: paperWash('l1'),
  level2: paperWash('l2'),
  level3: paperWash('l3'),
  level4: '',
  known: '',
  ignored: '',
};

/** Subtle dotted cue for words predicted above the learner's reading level in Smart mode. */
export const SMART_HINT_CLASS =
  'underline decoration-dotted decoration-[1.5px] underline-offset-[5px] decoration-[color-mix(in_srgb,var(--w-l1-fg)_48%,transparent)]';

export function wordCellHighlightClass({
  state,
  mode = 'saved',
  isSmartHint = false,
}: {
  state?: WordState;
  mode?: WordHighlightMode;
  isSmartHint?: boolean;
}): string {
  if (mode === 'clean') return '';
  const resolvedState: WordState = state ?? 'new';
  if (mode === 'smart') {
    if (resolvedState === 'known' || resolvedState === 'ignored' || resolvedState === 'level4') {
      return '';
    }
    if (resolvedState === 'level1' || resolvedState === 'level2' || resolvedState === 'level3') {
      return stateClasses[resolvedState];
    }
    return isSmartHint ? SMART_HINT_CLASS : '';
  }
  return stateClasses[resolvedState];
}
