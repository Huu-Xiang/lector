import '../test-guard';
import { describe, expect, test } from 'bun:test';
import { checkAnswer, problemWith } from './warm-entry-cache';

const item = {
  word: 'tour',
  senses: ['noun: tower', 'noun: rook', 'noun: apartment building', 'noun: turn'],
};

describe('warm-entry-cache answer checks', () => {
  test('accepts a clean answer', () => {
    expect(checkAnswer(item, ['塔', '车（国际象棋）', '高层公寓楼', '轮次、回合'])).toBeNull();
  });

  test('rejects a wrong count, English text and bopomofo', () => {
    expect(checkAnswer(item, ['塔'])).toContain('expected 4');
    expect(problemWith('the (definite article)')).toBe('no Chinese in gloss');
    expect(problemWith('用于 plural of 前')).toBe('English words in gloss');
    expect(problemWith('线 (ㄒㄧㄢˋ)')).toBe('bopomofo in gloss');
    expect(problemWith('x'.repeat(81))).toBe('gloss too long');
  });

  test('lets a single Latin letter stand inside a Chinese gloss', () => {
    expect(problemWith('法语字母a')).toBeNull();
    expect(problemWith('音符 A')).toBeNull();
  });

  test('rejects one gloss repeated for different senses', () => {
    expect(checkAnswer(item, ['圈', '圈', '圈', '圈'])).toContain('repeated');
  });

  test('allows repeated grammar glosses for form-of senses', () => {
    const forms = {
      word: 'vais',
      senses: ['verb: inflection of aller', 'verb: inflection of vader'],
    };
    expect(checkAnswer(forms, ['aller 的变位形式', 'vader 的变位形式'])).toBeNull();
  });
});
