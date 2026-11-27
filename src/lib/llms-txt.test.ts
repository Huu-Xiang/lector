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

  it('highlights shipped learning capabilities, plans, iOS support, multilingual vocab tests, and localized URLs', () => {
    expect(text).toContain('FSRS');
    expect(text).toContain('LingQ');
    expect(text).toContain('concordance');
    expect(text).toContain('text-to-speech');
    expect(text).toContain('Free ($0): 1,000 AI word lookups');
    expect(text).toContain('Plus (from $3/month): 5,000 AI word lookups');
    expect(text).toContain('Pro: 10,000 AI word lookups');
    expect(text).toContain('Max: 30,000 AI word lookups');
    expect(text).toContain('companion iOS app');
    expect(text).not.toContain('no app-store download');
    expect(text).toContain('https://readfox.app/vocab-test/fr');
    expect(text).toContain('https://readfox.app/vocab-test/es');
    expect(text).toContain('https://readfox.app/alternatives');
    expect(text).toContain('https://readfox.app/alternatives/lute');
    expect(text).toContain('https://readfox.app/alternatives/duolingo');
    expect(text).toContain('https://readfox.app/alternatives/lingq-for-korean');
    expect(text).toContain('https://readfox.app/tools/text-difficulty');
    expect(text).toContain('https://readfox.app/tools/epub-reader-ai-dictionary');
    for (const prefix of ['/zh-cn', '/zh-tw', '/ja', '/ko', '/ru']) {
      expect(text).toContain(`https://readfox.app${prefix}`);
    }
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

  it('reflects CARD_PAYMENTS_PENDING in payment-method copy', () => {
    const prev = process.env.CARD_PAYMENTS_PENDING;
    try {
      delete process.env.CARD_PAYMENTS_PENDING;
      expect(buildLlmsTxt()).toContain('card, PayPal, or Alipay');

      process.env.CARD_PAYMENTS_PENDING = '1';
      const pending = buildLlmsTxt();
      expect(pending).toContain('Alipay (card and PayPal coming soon)');
      expect(pending).not.toContain('card, PayPal, or Alipay');
    } finally {
      if (prev === undefined) delete process.env.CARD_PAYMENTS_PENDING;
      else process.env.CARD_PAYMENTS_PENDING = prev;
    }
  });
});
