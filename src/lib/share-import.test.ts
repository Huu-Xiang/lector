import { describe, expect, it, vi } from 'vitest';
import {
  importSharedArticle,
  parseSharedUrl,
  peekPendingShare,
  rememberPendingShare,
  clearPendingShare,
  type ShareStorage,
} from './share-import';

describe('parseSharedUrl', () => {
  it('accepts http and https links', () => {
    expect(parseSharedUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(parseSharedUrl('  http://example.com/x  ')).toBe('http://example.com/x');
  });

  it('rejects anything else before any request is made', () => {
    expect(parseSharedUrl('javascript:alert(1)')).toBeNull();
    expect(parseSharedUrl('file:///etc/passwd')).toBeNull();
    expect(parseSharedUrl('readfox://share')).toBeNull();
    expect(parseSharedUrl('not a url')).toBeNull();
    expect(parseSharedUrl('')).toBeNull();
    expect(parseSharedUrl(null)).toBeNull();
  });
});

describe('importSharedArticle', () => {
  const article = { title: 'T', author: null, content: 'Body text', siteName: null };

  it('makes one lesson from an extracted article and returns its id', async () => {
    const extract = vi.fn(async () => ({ ok: true as const, data: article }));
    const create = vi.fn(async () => ({ collectionId: 'c1', lessonId: 'l1' }));
    const out = await importSharedArticle('https://example.com/a', { extract, create });
    expect(out).toEqual({ ok: true, lessonId: 'l1' });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({ title: 'T', author: '', textContent: 'Body text' });
  });

  it('creates no lesson when the article cannot be extracted', async () => {
    const extract = vi.fn(async () => ({ ok: false as const, message: 'No readable text' }));
    const create = vi.fn();
    const out = await importSharedArticle('https://example.com/a', { extract, create });
    expect(out).toEqual({ ok: false, message: 'No readable text' });
    expect(create).not.toHaveBeenCalled();
  });

  it('reports a failure to save the lesson', async () => {
    const extract = vi.fn(async () => ({ ok: true as const, data: article }));
    const create = vi.fn(async () => {
      throw new Error('Plan limit reached');
    });
    const out = await importSharedArticle('https://example.com/a', { extract, create });
    expect(out).toEqual({ ok: false, message: 'Plan limit reached' });
  });
});

describe('pending share', () => {
  function memory(): ShareStorage {
    const data = new Map<string, string>();
    return {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    };
  }

  it('keeps a valid link until it is cleared', () => {
    const store = memory();
    rememberPendingShare('https://example.com/a', store);
    expect(peekPendingShare(store)).toBe('https://example.com/a');
    clearPendingShare(store);
    expect(peekPendingShare(store)).toBeNull();
  });

  it('does not keep a link that is not http or https', () => {
    const store = memory();
    rememberPendingShare('javascript:alert(1)', store);
    expect(peekPendingShare(store)).toBeNull();
  });
});
