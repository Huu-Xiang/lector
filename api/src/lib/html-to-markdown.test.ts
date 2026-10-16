import { describe, test, expect } from 'bun:test';
import { htmlToMarkdown } from './html-to-markdown';

describe('htmlToMarkdown on crafted input', () => {
  test('unclosed tags stay fast', () => {
    const started = performance.now();
    htmlToMarkdown('<a href="'.repeat(20_000));
    htmlToMarkdown('<p>'.repeat(100_000));
    htmlToMarkdown('<p><strong>x'.repeat(20_000) + '</p>');
    expect(performance.now() - started).toBeLessThan(2000);
  });

  test('closed tags still convert', () => {
    expect(htmlToMarkdown('<h1>T</h1><p>a <strong>b</strong> <a href="u">l</a></p>')).toBe(
      '# T\n\na **b** [l](u)',
    );
  });
});
