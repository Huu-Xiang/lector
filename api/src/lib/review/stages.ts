import type { WordState } from '../../db';
import type { ReviewCard } from './scheduler';

export type ReviewStage = 'new' | 'learning' | 'familiar' | 'mastered';

const FAMILIAR_MIN_STABILITY = 7;
const MASTERED_MIN_STABILITY = 30;

export function stageOf(card: ReviewCard): ReviewStage {
  if (card.state === 'new') return 'new';
  if (card.state !== 'review' || card.stability < FAMILIAR_MIN_STABILITY) return 'learning';
  if (card.stability < MASTERED_MIN_STABILITY) return 'familiar';
  return 'mastered';
}

const READER_STATE_FOR_STAGE = {
  new: 'level1',
  learning: 'level2',
  familiar: 'level3',
  mastered: 'known',
} as const satisfies Record<ReviewStage, WordState>;

export function readerStateForStage(stage: ReviewStage): WordState {
  return READER_STATE_FOR_STAGE[stage];
}

export function stageWithReaderState(
  card: ReviewCard,
  readerState: WordState,
  retired: boolean,
): ReviewStage {
  if (readerState === 'level4' || (readerState === 'known' && !retired)) return 'mastered';
  return stageOf(card);
}
