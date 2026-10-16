import { describe, expect, test } from 'bun:test';
import { GLOBAL_VOICES_EN } from './global-voices';

const FIXTURE_POST = {
  link: 'https://globalvoices.org/2026/01/01/example-post/',
  date: '2026-01-01T12:00:00',
  title: { rendered: 'An &#8220;example&#8221; post' },
  content: { rendered: '<p>Hello <strong>world</strong>.</p><p>Second paragraph.</p>' },
};

describe('GLOBAL_VOICES_EN source', () => {
  test('extracts clean text and decodes HTML entities in the title', async () => {
    const fakeFetch = (async () => new Response(JSON.stringify([FIXTURE_POST]))) as typeof fetch;
    const articles = await GLOBAL_VOICES_EN.fetch(fakeFetch);
    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe('An “example” post');
    expect(articles[0].url).toBe(FIXTURE_POST.link);
    expect(articles[0].license).toBe('CC BY 3.0');
    expect(articles[0].text).not.toContain('<p>');
    expect(articles[0].text).toContain('Hello');
    expect(articles[0].text).toContain('Second paragraph');
  });
});
