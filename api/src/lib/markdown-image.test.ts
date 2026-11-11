import { describe, expect, it } from 'bun:test';
import { firstMarkdownImage } from './markdown-image';

describe('firstMarkdownImage', () => {
  it('returns the first https image', () => {
    const text = 'Intro\n\n![A kite](https://example.org/a.jpg)\n\n![](https://example.org/b.jpg)';
    expect(firstMarkdownImage(text)).toBe('https://example.org/a.jpg');
  });

  it('skips plain links and returns null when there is no image', () => {
    expect(firstMarkdownImage('See [the site](https://example.org/page).')).toBeNull();
    expect(firstMarkdownImage('No pictures here.')).toBeNull();
  });

  it('ignores an image that is not on https', () => {
    expect(firstMarkdownImage('![](http://example.org/a.jpg)')).toBeNull();
    expect(firstMarkdownImage('![](data:image/png;base64,AAAA)')).toBeNull();
  });
});
