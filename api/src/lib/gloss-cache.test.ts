import '../test-guard';
import { afterEach, describe, expect, test } from 'bun:test';
import { db } from '../db';
import { isCacheableGloss, normalizeGlossWord, sharedGlossCache } from './gloss-cache';

afterEach(() => db.prepare('DELETE FROM shared_gloss_cache').run());

describe('shared gloss cache', () => {
  test('stores and returns a gloss by language pair and normalized word', () => {
    sharedGlossCache.put('fr', 'zh-CN', 'Éponge', '海绵; 放弃');
    expect(sharedGlossCache.get('fr', 'zh-CN', 'éponge')).toBe('海绵; 放弃');
    expect(sharedGlossCache.get('fr', 'en', 'éponge')).toBeNull();
    expect(sharedGlossCache.get('de', 'zh-CN', 'éponge')).toBeNull();
  });

  test('counts hits and keeps no user data', () => {
    sharedGlossCache.put('fr', 'en', 'chat', 'cat');
    sharedGlossCache.get('fr', 'en', 'chat');
    sharedGlossCache.get('fr', 'en', 'chat');
    const row = db.prepare('SELECT * FROM shared_gloss_cache').get() as Record<string, unknown>;
    expect(row.hits).toBe(2);
    expect(Object.keys(row)).not.toContain('userId');
  });

  test('refuses multi-line or oversized answers', () => {
    expect(isCacheableGloss('cat')).toBe(true);
    expect(isCacheableGloss('line one\nline two')).toBe(false);
    expect(isCacheableGloss('x'.repeat(121))).toBe(false);
    expect(isCacheableGloss('   ')).toBe(false);
    sharedGlossCache.put('fr', 'en', 'bad', 'a\nb');
    expect(sharedGlossCache.get('fr', 'en', 'bad')).toBeNull();
  });

  test('normalizes case and unicode form', () => {
    expect(normalizeGlossWord('  ÉPONGE ')).toBe('éponge');
  });

  test('ignores answers older than the expiry', () => {
    sharedGlossCache.put('fr', 'en', 'vieux', 'old');
    db.prepare("UPDATE shared_gloss_cache SET createdAt = '2020-01-01T00:00:00.000Z'").run();
    expect(sharedGlossCache.get('fr', 'en', 'vieux')).toBeNull();
  });
});
