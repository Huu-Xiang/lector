import { WordState } from '@/types';

// Words are plain text. A word still being learned carries an underline that
// fades from level1 (least known) to level4; `new`, `known` and `ignored` carry
// none. Selection is drawn by WordCell, not here. The --w-* tokens flip under
// `.dark`, so one map serves both modes.
const learning = (level: 'l1' | 'l2' | 'l3' | 'l4', mix: number) =>
  `underline decoration-[1.5px] underline-offset-[5px] decoration-[color-mix(in_srgb,var(--w-${level}-fg)_${mix}%,transparent)]`;

export const stateClasses: Record<WordState, string> = {
  new: '',
  level1: learning('l1', 90),
  level2: learning('l2', 65),
  level3: learning('l3', 45),
  level4: learning('l4', 28),
  known: '',
  ignored: 'opacity-60 text-muted-foreground',
};
