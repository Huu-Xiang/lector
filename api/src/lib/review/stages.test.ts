import { describe, test, expect } from 'bun:test';
import { emptyCard, seedReviewCard, type ReviewCard } from './scheduler';
import { readerStateForStage, stageOf, stageWithReaderState } from './stages';

const NOW = Date.parse('2026-11-04T12:00:00Z');
const review = (stability: number) => seedReviewCard({ stability, difficulty: 5, now: NOW });

describe('stageOf', () => {
  test('state New is New', () => {
    expect(stageOf(emptyCard(NOW))).toBe('new');
  });

  test('Learning and Relearning are Learning at any stability', () => {
    const card = review(40);
    expect(stageOf({ ...card, state: 'learning' } satisfies ReviewCard)).toBe('learning');
    expect(stageOf({ ...card, state: 'relearning' } satisfies ReviewCard)).toBe('learning');
  });

  test('Review stability thresholds: 6.9 Learning, 7 and 29.9 Familiar, 30 Mastered', () => {
    expect(stageOf(review(6.9))).toBe('learning');
    expect(stageOf(review(7))).toBe('familiar');
    expect(stageOf(review(29.9))).toBe('familiar');
    expect(stageOf(review(30))).toBe('mastered');
  });
});

describe('readerStateForStage', () => {
  test('maps review stages to reader states', () => {
    expect(readerStateForStage('new')).toBe('level1');
    expect(readerStateForStage('learning')).toBe('level2');
    expect(readerStateForStage('familiar')).toBe('level3');
    expect(readerStateForStage('mastered')).toBe('known');
  });
});

describe('stageWithReaderState', () => {
  test('reader level4 and a non-retired known both derive Mastered', () => {
    const card = review(2);
    expect(stageWithReaderState(card, 'level4', false)).toBe('mastered');
    expect(stageWithReaderState(card, 'known', false)).toBe('mastered');
  });

  test('a retired known and other reader states use the card stage', () => {
    const card = review(2);
    expect(stageWithReaderState(card, 'known', true)).toBe('learning');
    expect(stageWithReaderState(card, 'level3', false)).toBe('learning');
    expect(stageWithReaderState(emptyCard(NOW), 'level1', false)).toBe('new');
  });
});
