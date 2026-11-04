import '../test-guard';
import { afterEach, describe, expect, test } from 'bun:test';
import { db } from '../db';
import {
  isCacheableSentenceTranslation,
  sentenceHash,
  sharedSentenceTranslationCache,
} from './sentence-translation-cache';

afterEach(() => db.prepare('DELETE FROM shared_sentence_translation').run());

describe('shared sentence translation cache', () => {
  test('stores and returns a translation by language pair and sentence', () => {
    sharedSentenceTranslationCache.put('fr', 'zh-CN', 'Le chat dort.', '猫在睡觉。');
    expect(sharedSentenceTranslationCache.get('fr', 'zh-CN', 'Le chat dort.')).toBe('猫在睡觉。');
    expect(sharedSentenceTranslationCache.get('fr', 'zh-CN', '  Le   chat dort. ')).toBe(
      '猫在睡觉。',
    );
    expect(sharedSentenceTranslationCache.get('fr', 'es', 'Le chat dort.')).toBeNull();
    expect(sharedSentenceTranslationCache.get('de', 'zh-CN', 'Le chat dort.')).toBeNull();
  });

  test('counts hits and keeps no user data', () => {
    sharedSentenceTranslationCache.put('fr', 'en', 'Le chat dort.', 'The cat sleeps.');
    sharedSentenceTranslationCache.get('fr', 'en', 'Le chat dort.');
    const row = db.prepare('SELECT * FROM shared_sentence_translation').get() as Record<
      string,
      unknown
    >;
    expect(row.hits).toBe(1);
    expect(row.sentenceHash).toBe(sentenceHash('Le chat dort.'));
    expect(Object.keys(row)).not.toContain('userId');
  });

  test('refuses multi-line, empty or oversized answers', () => {
    expect(isCacheableSentenceTranslation('The cat sleeps.')).toBe(true);
    expect(isCacheableSentenceTranslation('one\ntwo')).toBe(false);
    expect(isCacheableSentenceTranslation('  ')).toBe(false);
    expect(isCacheableSentenceTranslation('x'.repeat(601))).toBe(false);
    sharedSentenceTranslationCache.put('fr', 'en', 'Salut.', 'a\nb');
    expect(sharedSentenceTranslationCache.get('fr', 'en', 'Salut.')).toBeNull();
  });

  test('ignores answers older than the expiry', () => {
    sharedSentenceTranslationCache.put('fr', 'en', 'Salut.', 'Hi.');
    db.prepare(
      "UPDATE shared_sentence_translation SET createdAt = '2020-01-01T00:00:00.000Z'",
    ).run();
    expect(sharedSentenceTranslationCache.get('fr', 'en', 'Salut.')).toBeNull();
  });
});
