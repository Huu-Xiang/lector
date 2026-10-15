import '../test-guard';
import { afterEach, describe, expect, test } from 'bun:test';
import { db } from '../db';
import { isCacheableGlosses, sharedEntryCache } from './entry-cache';

afterEach(() => db.prepare('DELETE FROM shared_entry_cache').run());

describe('shared entry cache', () => {
  test('stores glosses by language pair and normalized word', () => {
    sharedEntryCache.put('fr', 'zh-CN', 'Fois', ['次', '复数']);
    expect(sharedEntryCache.get('fr', 'zh-CN', 'fois')).toEqual(['次', '复数']);
    expect(sharedEntryCache.get('fr', 'en', 'fois')).toBeNull();
  });

  test('counts hits and keeps no user data', () => {
    sharedEntryCache.put('fr', 'zh-CN', 'fois', ['次']);
    sharedEntryCache.get('fr', 'zh-CN', 'fois');
    const row = db.prepare('SELECT * FROM shared_entry_cache').get() as Record<string, unknown>;
    expect(row.hits).toBe(1);
    expect(Object.keys(row)).not.toContain('userId');
  });

  test('refuses empty, multi-line or oversized glosses', () => {
    expect(isCacheableGlosses(['a', 'b'], 2)).toBe(true);
    expect(isCacheableGlosses(['a'], 2)).toBe(false);
    expect(isCacheableGlosses(['a\nb'], 1)).toBe(false);
    expect(isCacheableGlosses([' '], 1)).toBe(false);
    expect(isCacheableGlosses(['x'.repeat(301)], 1)).toBe(false);
    expect(isCacheableGlosses('nope', 1)).toBe(false);
    sharedEntryCache.put('fr', 'en', 'bad', ['a\nb']);
    expect(sharedEntryCache.get('fr', 'en', 'bad')).toBeNull();
  });

  test('ignores answers older than the expiry', () => {
    sharedEntryCache.put('fr', 'zh-CN', 'vieux', ['旧']);
    db.prepare("UPDATE shared_entry_cache SET createdAt = '2020-01-01T00:00:00.000Z'").run();
    expect(sharedEntryCache.get('fr', 'zh-CN', 'vieux')).toBeNull();
  });
});
