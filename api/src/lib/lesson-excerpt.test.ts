import { describe, expect, test } from 'bun:test';
import { lessonExcerpt } from './lesson-excerpt';

describe('lessonExcerpt', () => {
  test('skips the heading and returns the first words', () => {
    expect(lessonExcerpt("# 2. Gulliver's Travels\n\nIt seems, that upon the first moment.")).toBe(
      'It seems, that upon the first moment.',
    );
  });

  test('removes Markdown marks, links and images', () => {
    expect(
      lessonExcerpt(
        '> A _quoted_ **line** with a [link](https://example.com) ![alt](x.png) `code`',
      ),
    ).toBe('A quoted line with a link code');
  });

  test('cuts a long text at a word and adds an ellipsis', () => {
    const excerpt = lessonExcerpt(`${'word '.repeat(60)}`);
    expect(excerpt.endsWith('word…')).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(141);
  });

  test('cuts text without spaces at the limit', () => {
    const excerpt = lessonExcerpt('字'.repeat(300));
    expect(excerpt).toBe(`${'字'.repeat(140)}…`);
  });

  test('is empty for a lesson with a heading only', () => {
    expect(lessonExcerpt('# Title\n\n')).toBe('');
    expect(lessonExcerpt('')).toBe('');
  });
});
