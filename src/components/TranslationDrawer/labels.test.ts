import { describe, expect, it } from 'vitest';
import { parseLemmaLabel, posKey } from './labels';

describe('parseLemmaLabel', () => {
  it('keeps a Korean ending as the detail', () => {
    expect(parseLemmaLabel('이 form of')).toEqual({ key: 'formOf', detail: '이' });
    expect(parseLemmaLabel('을 + 는 form of')).toEqual({ key: 'formOf', detail: '을 + 는' });
  });

  it('drops English grammar tags', () => {
    expect(parseLemmaLabel('inflected form of')).toEqual({ key: 'formOf', detail: null });
    expect(parseLemmaLabel('plural genitive form of')).toEqual({ key: 'formOf', detail: null });
    expect(parseLemmaLabel('form of')).toEqual({ key: 'formOf', detail: null });
  });

  it('maps fixed labels', () => {
    expect(parseLemmaLabel('diminutive of')).toEqual({ key: 'diminutive', detail: null });
    expect(parseLemmaLabel('adverbial form of')).toEqual({ key: 'adverbial', detail: null });
  });

  it('leaves an unknown label raw', () => {
    expect(parseLemmaLabel('alternative spelling of')).toEqual({
      key: null,
      raw: 'alternative spelling of',
    });
  });
});

describe('posKey', () => {
  it('normalises dictionary and AI spellings', () => {
    expect(posKey('noun')).toBe('noun');
    expect(posKey('NOUN')).toBe('noun');
    expect(posKey('Adjective')).toBe('adj');
    expect(posKey('名词')).toBeNull();
  });
});
