import '../test-guard';
import { describe, expect, test } from 'bun:test';
import {
  checkAnswer,
  frenchProblemWith,
  koreanProblemWith,
  latinProblemWith,
  problemWith,
} from './warm-entry-cache';

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

  test('English to French answers must be French text, not Chinese or a copy', () => {
    const queen = { word: 'queen', senses: ['noun: the wife or widow of a king'] };
    expect(checkAnswer(queen, ['reine, épouse du roi'], 'en-fr')).toBeNull();
    expect(checkAnswer(queen, ['王后'], 'en-fr')).toContain('Chinese');
    expect(checkAnswer(queen, ['the wife or widow of a king'], 'en-fr')).toContain('copied');
    expect(frenchProblemWith('', 'noun: x')).toBe('empty gloss');
    expect(frenchProblemWith('x'.repeat(101), 'noun: x')).toBe('gloss too long');
  });
});

describe('Chinese to Spanish and French answer checks', () => {
  const word = {
    word: '银行',
    senses: ['noun: bank (financial institution)', 'noun: jewellery dealer'],
  };

  test('accepts Latin-script glosses and keeps Han characters from the English sense', () => {
    expect(checkAnswer(word, ['banco', 'joyero'], 'zh-es')).toBeNull();
    expect(latinProblemWith('clasificador 个 para personas', 'noun: (Classifier: 个)')).toBeNull();
  });

  test('rejects an empty gloss, kana, no letters and a copied English sense', () => {
    expect(latinProblemWith('', 'noun: bank')).toBe('empty gloss');
    expect(latinProblemWith('ぎんこう', 'noun: bank')).toBe('kana or bopomofo in gloss');
    expect(latinProblemWith('银行', 'noun: bank')).toBe('no letters in gloss');
    expect(
      latinProblemWith(
        'bank (financial institution) of the city',
        'noun: bank (financial institution) of the city',
      ),
    ).toBe('English text copied');
  });

  test('checks the sense count for both pairs', () => {
    expect(checkAnswer(word, ['banque'], 'zh-fr')).toContain('expected 2');
  });
});

describe('Korean pair answer checks', () => {
  const sense = 'noun: book';

  test('Korean to Chinese answers must hold Chinese and no English words', () => {
    expect(checkAnswer({ word: '책', senses: [sense] }, ['书、书籍'], 'ko-zh')).toBeNull();
    expect(checkAnswer({ word: '책', senses: [sense] }, ['the book'], 'ko-zh')).toContain(
      'no Chinese',
    );
  });

  test('Chinese to Korean answers must be Hangul without kana or copied English', () => {
    expect(koreanProblemWith('책, 서적', sense)).toBeNull();
    expect(koreanProblemWith('', sense)).toBe('empty gloss');
    expect(koreanProblemWith('本', sense)).toBe('Han characters in gloss');
    expect(koreanProblemWith('ほん', sense)).toBe('kana or bopomofo in gloss');
    expect(koreanProblemWith('book', sense)).toBe('no Korean in gloss');
    expect(
      koreanProblemWith('보조 용언 (Classifier: 个)', 'classifier: (Classifier: 个)'),
    ).toBeNull();
    expect(koreanProblemWith('x'.repeat(101), sense)).toBe('gloss too long');
  });
});
