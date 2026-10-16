import { beforeEach, describe, expect, it } from 'vitest';
import {
  knownDescriptions,
  rememberDescriptions,
  resetDescriptionMemory,
} from './description-cache';

beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  resetDescriptionMemory();
});

describe('description cache', () => {
  it('returns what was stored, per native language', () => {
    rememberDescriptions('zh-CN', { a: { title: '甲', summary: '乙' } });
    expect(knownDescriptions('zh-CN', ['a', 'b'])).toEqual({ a: { title: '甲', summary: '乙' } });
    expect(knownDescriptions('ja', ['a'])).toEqual({});
  });

  it('survives a reload (memory cleared, storage kept)', () => {
    rememberDescriptions('zh-CN', { a: { title: '甲', summary: '乙' } });
    resetDescriptionMemory();
    expect(knownDescriptions('zh-CN', ['a']).a.title).toBe('甲');
  });

  it('keeps only the newest 400', () => {
    const many = Object.fromEntries(
      Array.from({ length: 450 }, (_, i) => [`id${i}`, { title: `t${i}`, summary: 's' }]),
    );
    rememberDescriptions('zh-CN', many);
    const kept = knownDescriptions('zh-CN', Object.keys(many));
    expect(Object.keys(kept)).toHaveLength(400);
    expect(kept.id449).toBeDefined();
    expect(kept.id0).toBeUndefined();
  });
});
