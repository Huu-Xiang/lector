import '../../test-guard';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { db } from '../../db';
import { LLMContentFilterError, type CompletionOptions, type LLMProvider } from '../llm';
import {
  buildDescribePrompt,
  describeArticles,
  knownNatives,
  warmDescriptions,
  parseDescription,
  setDescribeProviderForTests,
} from './describe';
import { upsertReadingFeedArticle } from './store';
import type { ReadingFeedRow } from './types';

class Fake implements LLMProvider {
  name = 'fake';
  model = 'fake';
  calls: CompletionOptions[] = [];
  reply = '{"title":"测试文章","summary":"这篇文章讲的是测试。"}';
  async complete(options: CompletionOptions) {
    this.calls.push(options);
    return this.reply;
  }
  async *stream() {
    yield '';
  }
}

function seed(): ReadingFeedRow {
  upsertReadingFeedArticle({
    language: 'en',
    interest: 'news',
    source: 'global-voices',
    title: 'Test Article',
    url: 'https://example.com/describe',
    author: null,
    license: 'CC BY 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
    publishedAt: '2026-01-01T00:00:00.000Z',
    text: 'word '.repeat(300),
    wordCount: 300,
    level: 'B1',
    fetchedAt: '2026-01-01T00:00:00.000Z',
  });
  return db
    .prepare("SELECT * FROM reading_feed WHERE url = 'https://example.com/describe'")
    .get() as ReadingFeedRow;
}

let fake: Fake;
beforeEach(() => {
  db.prepare('DELETE FROM reading_feed').run();
  db.prepare('DELETE FROM reading_feed_summary').run();
  fake = new Fake();
  setDescribeProviderForTests(() => fake);
});
afterEach(() => setDescribeProviderForTests(null));

describe('parseDescription', () => {
  test('reads JSON, with or without a code fence', () => {
    expect(parseDescription('{"title":"A","summary":"B"}')).toEqual({ title: 'A', summary: 'B' });
    expect(parseDescription('```json\n{"title":"A","summary":"B"}\n```')).toEqual({
      title: 'A',
      summary: 'B',
    });
  });

  test('rejects text that is not a complete description', () => {
    expect(parseDescription('not json')).toBeNull();
    expect(parseDescription('{"title":"A"}')).toBeNull();
  });
});

describe('describeArticles', () => {
  test('asks for the native language, then serves the second call from the cache', async () => {
    const article = seed();
    const first = await describeArticles([article], 'zh-CN');
    expect(first.get(article.id)?.title).toBe('测试文章');
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].messages[0].content).toContain('Simplified Chinese');

    const second = await describeArticles([article], 'zh-CN');
    expect(second.get(article.id)?.summary).toContain('测试');
    expect(fake.calls).toHaveLength(1);

    await describeArticles([article], 'ja');
    expect(fake.calls).toHaveLength(2);
  });

  test('leaves out an article when the model reply is unusable', async () => {
    fake.reply = 'sorry';
    const article = seed();
    expect((await describeArticles([article], 'zh-CN')).size).toBe(0);
  });

  test('does not ask again after the provider declines an article', async () => {
    const article = seed();
    fake.complete = async (options: CompletionOptions) => {
      fake.calls.push(options);
      throw new LLMContentFilterError();
    };
    expect((await describeArticles([article], 'ko')).size).toBe(0);
    expect((await describeArticles([article], 'ko')).size).toBe(0);
    expect(fake.calls).toHaveLength(1);
  });

  test('the prompt carries the title and an excerpt', () => {
    const article = seed();
    const prompt = buildDescribePrompt(article, 'Simplified Chinese');
    expect(prompt).toContain('Title: Test Article');
    expect(prompt).toContain('English');
  });
});

describe('warmDescriptions', () => {
  test('writes descriptions for every native language readers chose, once', async () => {
    db.prepare('DELETE FROM settings').run();
    db.prepare(
      "INSERT INTO settings (userId, key, value) VALUES ('u1', 'nativeLanguage', '\"ja\"')",
    ).run();
    db.prepare(
      "INSERT INTO settings (userId, key, value) VALUES ('u2', 'nativeLanguage', '\"zz\"')",
    ).run();
    const article = seed();
    expect(knownNatives().sort()).toEqual(['ja', 'zh-CN']);

    expect(await warmDescriptions()).toBe(2);
    expect(fake.calls).toHaveLength(2);
    expect(await warmDescriptions()).toBe(0);
    expect(fake.calls).toHaveLength(2);
    db.prepare('DELETE FROM settings').run();
    expect(article.id).toBeTruthy();
  });
});
