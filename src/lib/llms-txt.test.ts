import { describe, expect, it, vi } from 'vitest';
import { buildLlmsTxt } from './llms-txt';
import { listPublicBooks } from './public-books';

describe('llms.txt', () => {
  const text = buildLlmsTxt();

  it('starts with the site name and a one-line summary', () => {
    expect(text.startsWith('# Readfox\n\n> ')).toBe(true);
  });

  it('links every free book page once', () => {
    for (const book of listPublicBooks()) {
      const url = `https://readfox.app/books/${book.language}/${book.slug})`;
      expect(text.split(url).length - 1, url).toBe(1);
    }
  });

  it('links the free vocabulary test', () => {
    expect(text).toContain('(https://readfox.app/vocab-test)');
  });

  it('counts the library in the facts', () => {
    expect(text).toContain(`Free library: ${listPublicBooks().length} public-domain`);
  });

  it('names the welcome code only while the offer runs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-15T15:59:00Z'));
    expect(buildLlmsTxt()).toContain('no code needed');
    expect(buildLlmsTxt()).toContain('redeem code WELCOME123');
    vi.setSystemTime(new Date('2026-12-15T16:00:00Z'));
    expect(buildLlmsTxt()).not.toContain('WELCOME123');
    vi.useRealTimers();
  });
});
