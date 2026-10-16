import { describe, expect, it } from 'vitest';
import { approximateLevelFor, examRefs, isCefrLevel, showMainlandExams } from './reading-level';

describe('exam references', () => {
  it('lists IELTS, TOEFL and mainland exams for English B1', () => {
    expect(examRefs('en', 'B1', true).map((r) => r.exam)).toEqual([
      'ielts',
      'toefl',
      'gaokao',
      'cet4',
    ]);
  });

  it('drops mainland exams when they are not wanted', () => {
    expect(examRefs('en', 'B1', false).map((r) => r.exam)).toEqual(['ielts', 'toefl']);
    expect(examRefs('en', 'A1', false)).toEqual([]);
  });

  it('uses DELF and DALF for French and nothing for other languages', () => {
    expect(examRefs('fr', 'C1', true)).toEqual([{ exam: 'dalf', score: 'C1' }]);
    expect(examRefs('es', 'B1', true)).toEqual([]);
  });

  it('shows mainland exams for the Chinese interface', () => {
    expect(showMainlandExams('zh-CN')).toBe(true);
  });
});

describe('levels', () => {
  it('maps CEFR to the onboarding scale', () => {
    expect(approximateLevelFor(null)).toBe('not_sure');
    expect(approximateLevelFor('A1')).toBe('new');
    expect(approximateLevelFor('A2')).toBe('beginner');
    expect(approximateLevelFor('B2')).toBe('intermediate');
    expect(approximateLevelFor('C2')).toBe('advanced');
  });

  it('accepts only A1 to C2', () => {
    expect(isCefrLevel('B1')).toBe(true);
    expect(isCefrLevel('B3')).toBe(false);
    expect(isCefrLevel(undefined)).toBe(false);
  });
});
