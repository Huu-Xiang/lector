import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type Grade,
} from 'ts-fsrs';

export const FSRS_MODEL = 'FSRS-6';
export const FSRS_CONFIG_VERSION = 1;
export const MAX_INTERVAL_DAYS = 365;

const DAY_MS = 86_400_000;
const SEED_DIFFICULTY = 5;

export const CARD_STATES = ['new', 'learning', 'review', 'relearning'] as const;
export type CardState = (typeof CARD_STATES)[number];
export const REVIEW_RATINGS = ['again', 'hard', 'good'] as const;
export type ReviewRating = (typeof REVIEW_RATINGS)[number];
export type ReviewAnswer = 'dont_know' | 'fuzzy' | 'know' | 'right' | 'wrong';

/** Times are epoch ms; stability, elapsedDays and scheduledDays are days. */
export interface ReviewCard {
  state: CardState;
  due: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  lastReview: number | null;
}

const ANSWER_RATINGS: Record<ReviewAnswer, ReviewRating> = {
  dont_know: 'again',
  fuzzy: 'hard',
  know: 'good',
  right: 'good',
  wrong: 'again',
};

const GRADES: Record<ReviewRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
};

const STATES: Record<CardState, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

const STATE_NAMES: Record<State, CardState> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

export function ratingForAnswer(answer: ReviewAnswer): ReviewRating {
  return ANSWER_RATINGS[answer];
}

function toFsrs(card: ReviewCard): Card {
  return {
    state: STATES[card.state],
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsedDays,
    scheduled_days: card.scheduledDays,
    learning_steps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    last_review: card.lastReview === null ? undefined : new Date(card.lastReview),
  };
}

function fromFsrs(card: Card): ReviewCard {
  return {
    state: STATE_NAMES[card.state],
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    lastReview: card.last_review ? card.last_review.getTime() : null,
  };
}

export function emptyCard(now: number): ReviewCard {
  return fromFsrs(createEmptyCard(new Date(now)));
}

export function seedReviewCard(seed: {
  stability: number;
  difficulty: number;
  now: number;
}): ReviewCard {
  return {
    state: 'review',
    due: seed.now + seed.stability * DAY_MS,
    stability: seed.stability,
    difficulty: seed.difficulty,
    elapsedDays: 0,
    scheduledDays: seed.stability,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    lastReview: seed.now,
  };
}

export function createScheduler({ fuzz = true }: { fuzz?: boolean } = {}) {
  const engine = fsrs(
    generatorParameters({
      request_retention: 0.9,
      maximum_interval: MAX_INTERVAL_DAYS,
      learning_steps: ['10m'],
      relearning_steps: ['10m'],
      enable_fuzz: fuzz,
    }),
  );

  // ts-fsrs keeps good > hard by one day after capping, so Good can land on maximum_interval + 1.
  function capped(card: Card, now: number): ReviewCard {
    const next = fromFsrs(card);
    if (next.scheduledDays <= MAX_INTERVAL_DAYS) return next;
    return { ...next, scheduledDays: MAX_INTERVAL_DAYS, due: now + MAX_INTERVAL_DAYS * DAY_MS };
  }

  function review(card: ReviewCard, rating: ReviewRating, now: number): ReviewCard {
    return capped(engine.next(toFsrs(card), new Date(now), GRADES[rating]).card, now);
  }

  function preview(card: ReviewCard, now: number): Record<ReviewRating, ReviewCard> {
    return {
      again: review(card, 'again', now),
      hard: review(card, 'hard', now),
      good: review(card, 'good', now),
    };
  }

  return { review, preview };
}

export type Scheduler = ReturnType<typeof createScheduler>;

const READER_LEVEL_STABILITY = { level2: 2, level3: 10, level4: 30 } as const;

export function seedFromReaderLevel(
  level: 'new' | 'level1' | 'level2' | 'level3' | 'level4',
  now: number,
): ReviewCard {
  if (level === 'new' || level === 'level1') return emptyCard(now);
  return seedReviewCard({
    stability: READER_LEVEL_STABILITY[level],
    difficulty: SEED_DIFFICULTY,
    now,
  });
}

export interface LegacyClozeProgress {
  masteryLevel: number;
  reviewCount: number;
  timesCorrect: number;
  timesIncorrect: number;
  lastReviewed: string | null;
  nextReview: string;
}

const LEGACY_FALLBACK_STABILITY: Record<number, number> = { 25: 1, 50: 3, 75: 7, 100: 14 };
const LEGACY_LEARNING_STABILITY = 0.5;

function legacyDifficulty(timesCorrect: number, timesIncorrect: number): number {
  const answers = timesCorrect + timesIncorrect;
  if (answers === 0) return SEED_DIFFICULTY;
  const errorRate = timesIncorrect / answers;
  return Math.min(8, Math.max(3, SEED_DIFFICULTY + 4 * (errorRate - 0.25)));
}

export function seedFromLegacy(legacy: LegacyClozeProgress, now: number): ReviewCard {
  if (legacy.masteryLevel === 0 && legacy.reviewCount === 0) return emptyCard(now);
  const due = Date.parse(legacy.nextReview);
  const lastReviewed = legacy.lastReviewed === null ? null : Date.parse(legacy.lastReviewed);
  const difficulty = legacyDifficulty(legacy.timesCorrect, legacy.timesIncorrect);
  const counts = { reps: legacy.reviewCount, lapses: legacy.timesIncorrect };

  if (legacy.masteryLevel === 0) {
    return {
      state: 'learning',
      due,
      stability: LEGACY_LEARNING_STABILITY,
      difficulty,
      elapsedDays: 0,
      scheduledDays: 0,
      learningSteps: 0,
      ...counts,
      lastReview: lastReviewed ?? now,
    };
  }

  const stability =
    lastReviewed === null
      ? (LEGACY_FALLBACK_STABILITY[legacy.masteryLevel] ?? 1)
      : Math.max(1, (due - lastReviewed) / DAY_MS);
  return {
    ...seedReviewCard({ stability, difficulty, now: due - stability * DAY_MS }),
    ...counts,
  };
}
