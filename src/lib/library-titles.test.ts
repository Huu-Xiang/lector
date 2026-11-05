import { describe, expect, it, vi } from 'vitest';

vi.mock('./data-layer', () => ({ getLibraryCatalog: vi.fn(), getSetting: vi.fn() }));

import { translatedBookTitle } from './library-titles';

const book = {
  original: 'Black Beauty',
  titles: { 'zh-CN': '黑骏马', fr: 'Black Beauty' },
  blurbs: {},
};

describe('translatedBookTitle', () => {
  it('uses the native title for an untouched library book', () => {
    expect(translatedBookTitle('Black Beauty', book, 'zh-CN')).toBe('黑骏马');
  });

  it('shows the Simplified title when a Traditional one is missing', () => {
    expect(translatedBookTitle('Black Beauty', book, 'zh-TW')).toBe('黑骏马');
    const withTraditional = { ...book, titles: { ...book.titles, 'zh-TW': '黑駿馬' } };
    expect(translatedBookTitle('Black Beauty', withTraditional, 'zh-TW')).toBe('黑駿馬');
  });

  it('keeps a title the reader renamed, and books without a translation', () => {
    expect(translatedBookTitle('My horse book', book, 'zh-CN')).toBe('My horse book');
    expect(translatedBookTitle('Black Beauty', book, 'ja')).toBe('Black Beauty');
    expect(translatedBookTitle('Black Beauty', undefined, 'zh-CN')).toBe('Black Beauty');
  });
});
