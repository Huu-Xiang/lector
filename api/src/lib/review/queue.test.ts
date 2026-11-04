import '../../test-guard';
import { describe, expect, test } from 'bun:test';
import { questionTypeFor } from './queue';

describe('questionTypeFor', () => {
  const base = { type: 'word', language: 'en', goal: 'recognize', reps: 0 } as const;

  test('follows the stage table for the Recognize goal', () => {
    expect(questionTypeFor({ ...base, stage: 'new' })).toBe('choose_meaning');
    expect(questionTypeFor({ ...base, stage: 'learning' })).toBe('recognition');
    expect(questionTypeFor({ ...base, stage: 'familiar' })).toBe('fill_in');
    expect(questionTypeFor({ ...base, stage: 'mastered' })).toBe('recognition');
  });

  test('Recognize and spell types the word, and alternates typing with dictation when audio exists', () => {
    const spell = { ...base, goal: 'recognize_spell' } as const;
    expect(questionTypeFor({ ...spell, stage: 'familiar' })).toBe('typed_fill_in');
    expect(questionTypeFor({ ...spell, stage: 'mastered', reps: 4 })).toBe('typed_fill_in');
    expect(questionTypeFor({ ...spell, stage: 'mastered', reps: 5 })).toBe('dictation');
    expect(questionTypeFor({ ...spell, stage: 'learning' })).toBe('recognition');
  });

  test('phrases, Chinese and Korean fall back to the recognition card', () => {
    const spell = { ...base, goal: 'recognize_spell' } as const;
    for (const stage of ['familiar', 'mastered'] as const) {
      expect(questionTypeFor({ ...spell, stage, type: 'phrase' })).toBe('recognition');
      expect(questionTypeFor({ ...spell, stage, language: 'zh' })).toBe('recognition');
      expect(questionTypeFor({ ...base, stage, language: 'ko' })).toBe('recognition');
    }
    expect(questionTypeFor({ ...base, stage: 'new', type: 'phrase' })).toBe('choose_meaning');
  });
});
