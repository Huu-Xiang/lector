import { WordState } from '@/types';

export const stateFilters: { value: WordState | 'all' | 'learning' }[] = [
  { value: 'all' },
  { value: 'learning' },
  { value: 'new' },
  { value: 'level1' },
  { value: 'level2' },
  { value: 'level3' },
  { value: 'level4' },
  { value: 'known' },
  { value: 'ignored' },
];

/** Page-size choices offered by the vocab list pagination control. */
export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

/** Default rows per page when the user hasn't picked one. */
export const DEFAULT_PAGE_SIZE = 50;

// State sort order for sorting
export const stateOrder: Record<WordState, number> = {
  new: 0,
  level1: 1,
  level2: 2,
  level3: 3,
  level4: 4,
  known: 5,
  ignored: 6,
};
