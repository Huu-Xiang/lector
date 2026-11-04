import '../test-guard';
import { afterEach, describe, expect, test } from 'bun:test';
import { db } from '../db';
import { isCacheableExample, sharedExampleSentenceCache } from './example-sentence-cache';

afterEach(() => db.prepare('DELETE FROM shared_example_sentence').run());

describe('shared example sentence cache', () => {
  test('stores one sentence per language and normalized word', () => {
    sharedExampleSentenceCache.put('fr', 'Éponge', {
      sentence: "J'utilise une éponge.",
      translation: 'I use a sponge.',
    });
    expect(sharedExampleSentenceCache.get('fr', 'éponge')).toEqual({
      sentence: "J'utilise une éponge.",
      translation: 'I use a sponge.',
    });
    expect(sharedExampleSentenceCache.get('de', 'éponge')).toBeNull();
  });

  test('keeps a missing translation as null and counts hits', () => {
    sharedExampleSentenceCache.put('fr', 'chat', { sentence: 'Le chat dort.', translation: null });
    expect(sharedExampleSentenceCache.get('fr', 'chat')?.translation).toBeNull();
    const row = db.prepare('SELECT * FROM shared_example_sentence').get() as Record<
      string,
      unknown
    >;
    expect(row.hits).toBe(1);
    expect(Object.keys(row)).not.toContain('userId');
  });

  test('refuses empty, multi-line or oversized sentences', () => {
    expect(isCacheableExample({ sentence: 'Le chat dort.', translation: null })).toBe(true);
    expect(isCacheableExample({ sentence: '  ', translation: null })).toBe(false);
    expect(isCacheableExample({ sentence: 'a\nb', translation: null })).toBe(false);
    expect(isCacheableExample({ sentence: 'x'.repeat(301), translation: null })).toBe(false);
    expect(isCacheableExample({ sentence: 'ok', translation: 'a\nb' })).toBe(false);
  });

  test('ignores answers older than the expiry', () => {
    sharedExampleSentenceCache.put('fr', 'chat', { sentence: 'Le chat dort.', translation: null });
    db.prepare("UPDATE shared_example_sentence SET createdAt = '2020-01-01T00:00:00.000Z'").run();
    expect(sharedExampleSentenceCache.get('fr', 'chat')).toBeNull();
  });
});
