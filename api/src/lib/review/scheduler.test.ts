import { describe, test, expect } from 'bun:test';
import {
  FSRS_CONFIG_VERSION,
  FSRS_MODEL,
  MAX_INTERVAL_DAYS,
  createScheduler,
  emptyCard,
  ratingForAnswer,
  seedFromLegacy,
  seedFromReaderLevel,
  seedReviewCard,
} from './scheduler';
import { stageOf } from './stages';

const DAY = 86_400_000;
const MINUTE = 60_000;
const NOW = Date.parse('2026-11-04T12:00:00Z');
const scheduler = createScheduler({ fuzz: false });

function lastReviewedDaysAgo(stability: number) {
  return seedReviewCard({ stability, difficulty: 5, now: NOW - stability * DAY });
}

describe('constants', () => {
  test('name the model and config version', () => {
    expect(FSRS_MODEL).toBe('FSRS-6');
    expect(FSRS_CONFIG_VERSION).toBe(1);
  });
});

describe('ratingForAnswer', () => {
  test('maps every raw answer per R11', () => {
    expect(ratingForAnswer('dont_know')).toBe('again');
    expect(ratingForAnswer('fuzzy')).toBe('hard');
    expect(ratingForAnswer('know')).toBe('good');
    expect(ratingForAnswer('right')).toBe('good');
    expect(ratingForAnswer('wrong')).toBe('again');
  });
});

describe('review', () => {
  test('a new card rated Good becomes Review, due two days later, stage Learning', () => {
    const next = scheduler.review(emptyCard(NOW), 'good', NOW);
    expect(next.state).toBe('review');
    expect(next.due).toBe(NOW + 2 * DAY);
    expect(stageOf(next)).toBe('learning');
    expect(next.lastReview).toBe(NOW);
    expect(next.reps).toBe(1);
  });

  test('a new card rated Again becomes Learning, due in 10 minutes', () => {
    const next = scheduler.review(emptyCard(NOW), 'again', NOW);
    expect(next.state).toBe('learning');
    expect(next.due).toBe(NOW + 10 * MINUTE);
  });

  test('AE3: a Familiar card rated Hard stays Familiar and is due sooner than Good', () => {
    const card = lastReviewedDaysAgo(10);
    expect(stageOf(card)).toBe('familiar');
    const hard = scheduler.review(card, 'hard', NOW);
    const good = scheduler.review(card, 'good', NOW);
    expect(stageOf(hard)).toBe('familiar');
    expect(hard.due).toBeLessThan(good.due);
  });

  test('AE4: a Mastered card rated Again becomes Relearning, stage Learning', () => {
    const card = lastReviewedDaysAgo(40);
    expect(stageOf(card)).toBe('mastered');
    const next = scheduler.review(card, 'again', NOW);
    expect(next.state).toBe('relearning');
    expect(stageOf(next)).toBe('learning');
    expect(next.lapses).toBe(1);
    expect(next.due).toBe(NOW + 10 * MINUTE);
  });

  test('no interval exceeds 365 days after repeated Good answers', () => {
    let card = emptyCard(NOW);
    let t = NOW;
    for (let i = 0; i < 25; i++) {
      card = scheduler.review(card, 'good', t);
      expect(card.scheduledDays).toBeLessThanOrEqual(MAX_INTERVAL_DAYS);
      expect(card.due - t).toBeLessThanOrEqual(MAX_INTERVAL_DAYS * DAY);
      t = card.due;
    }
    expect(card.scheduledDays).toBe(MAX_INTERVAL_DAYS);
  });

  test('with fuzz off, the same input and now give the same output', () => {
    const card = lastReviewedDaysAgo(10);
    const a = createScheduler({ fuzz: false }).review(card, 'good', NOW);
    const b = createScheduler({ fuzz: false }).review(card, 'good', NOW);
    expect(a).toEqual(b);
  });

  test('preview gives the result of each rating without changing the card', () => {
    const card = lastReviewedDaysAgo(10);
    const before = { ...card };
    const preview = scheduler.preview(card, NOW);
    expect(card).toEqual(before);
    expect(preview.again).toEqual(scheduler.review(card, 'again', NOW));
    expect(preview.hard).toEqual(scheduler.review(card, 'hard', NOW));
    expect(preview.good).toEqual(scheduler.review(card, 'good', NOW));
  });
});

describe('seedFromReaderLevel', () => {
  test('level 1 and new give an empty New card', () => {
    for (const level of ['level1', 'new'] as const) {
      const card = seedFromReaderLevel(level, NOW);
      expect(card).toEqual(emptyCard(NOW));
      expect(stageOf(card)).toBe('new');
    }
  });

  test('reader level 3 seeds Review with stability 10, due 10 days after now', () => {
    const card = seedFromReaderLevel('level3', NOW);
    expect(card.state).toBe('review');
    expect(card.stability).toBe(10);
    expect(card.difficulty).toBe(5);
    expect(card.due).toBe(NOW + 10 * DAY);
    expect(card.lastReview).toBe(NOW);
    expect(stageOf(card)).toBe('familiar');
  });

  test('levels 2 and 4 seed stability 2 and 30', () => {
    const l2 = seedFromReaderLevel('level2', NOW);
    const l4 = seedFromReaderLevel('level4', NOW);
    expect([l2.stability, l2.due, stageOf(l2)]).toEqual([2, NOW + 2 * DAY, 'learning']);
    expect([l4.stability, l4.due, stageOf(l4)]).toEqual([30, NOW + 30 * DAY, 'mastered']);
  });
});

describe('seedFromLegacy', () => {
  const base = {
    masteryLevel: 0,
    reviewCount: 0,
    timesCorrect: 0,
    timesIncorrect: 0,
    lastReviewed: null as string | null,
    nextReview: '2026-11-05T12:00:00.000Z',
  };

  test('mastery 0 with no reviews stays New', () => {
    expect(seedFromLegacy(base, NOW)).toEqual(emptyCard(NOW));
  });

  test('mastery 0 with reviews is Learning, due at nextReview, stability 0.5', () => {
    const card = seedFromLegacy(
      { ...base, reviewCount: 2, timesIncorrect: 2, lastReviewed: '2026-11-04T11:00:00.000Z' },
      NOW,
    );
    expect(card.state).toBe('learning');
    expect(card.stability).toBe(0.5);
    expect(card.due).toBe(Date.parse(base.nextReview));
    expect(card.reps).toBe(2);
    expect(card.lapses).toBe(2);
    expect(stageOf(card)).toBe('learning');
  });

  test('mastery 75 becomes Review with stability from the interval', () => {
    const card = seedFromLegacy(
      {
        masteryLevel: 75,
        reviewCount: 4,
        timesCorrect: 3,
        timesIncorrect: 1,
        lastReviewed: '2026-10-28T12:00:00.000Z',
        nextReview: '2026-11-11T12:00:00.000Z',
      },
      NOW,
    );
    expect(card.state).toBe('review');
    expect(card.stability).toBe(14);
    expect(card.difficulty).toBe(5);
    expect(card.due).toBe(Date.parse('2026-11-11T12:00:00.000Z'));
    expect(card.lastReview).toBe(Date.parse('2026-10-28T12:00:00.000Z'));
    expect(card.reps).toBe(4);
    expect(card.lapses).toBe(1);
    expect(stageOf(card)).toBe('familiar');
  });

  test('stability is at least 1 day', () => {
    const card = seedFromLegacy(
      {
        ...base,
        masteryLevel: 25,
        reviewCount: 1,
        timesCorrect: 1,
        lastReviewed: '2026-11-05T00:00:00.000Z',
        nextReview: '2026-11-05T06:00:00.000Z',
      },
      NOW,
    );
    expect(card.stability).toBe(1);
  });

  test('without lastReviewed, stability falls back by mastery level', () => {
    const fallback = { 25: 1, 50: 3, 75: 7, 100: 14 } as const;
    for (const [mastery, stability] of Object.entries(fallback)) {
      const card = seedFromLegacy(
        { ...base, masteryLevel: Number(mastery), reviewCount: 1, timesCorrect: 1 },
        NOW,
      );
      expect(card.stability).toBe(stability);
      expect(card.lastReview).toBe(Date.parse(base.nextReview) - stability * DAY);
    }
  });

  test('difficulty follows the error rate, clamped to 3..8', () => {
    const seed = (timesCorrect: number, timesIncorrect: number) =>
      seedFromLegacy(
        {
          ...base,
          masteryLevel: 50,
          reviewCount: timesCorrect + timesIncorrect,
          timesCorrect,
          timesIncorrect,
        },
        NOW,
      ).difficulty;
    expect(seed(0, 0)).toBe(5);
    expect(seed(3, 1)).toBe(5);
    expect(seed(1, 1)).toBe(6);
    expect(seed(0, 5)).toBe(8);
    expect(seed(10, 0)).toBe(4);
  });

  test('a seeded legacy card reviews like any other card', () => {
    const card = seedFromLegacy(
      {
        masteryLevel: 100,
        reviewCount: 5,
        timesCorrect: 5,
        timesIncorrect: 0,
        lastReviewed: '2026-10-21T12:00:00.000Z',
        nextReview: '2026-11-04T12:00:00.000Z',
      },
      NOW,
    );
    const next = scheduler.review(card, 'good', NOW);
    expect(next.state).toBe('review');
    expect(next.stability).toBeGreaterThan(card.stability);
  });
});
