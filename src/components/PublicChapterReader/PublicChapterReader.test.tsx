import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import PublicChapterReader from './index';

describe('PublicChapterReader', () => {
  it('keeps server-rendered paragraph text crawlable while wrapping words as interactive buttons', () => {
    const html = renderToStaticMarkup(
      <PublicChapterReader
        language="fr"
        paragraphs={['Bonjour le monde.']}
        hardWords={['monde']}
        registerHref="/register?next=%2Fclaim-book%3Fbook%3Dtest%26lang%3Dfr"
      />,
    );

    expect(html).toContain('data-testid="book-chapter"');
    expect(html).toContain('<p>');
    expect(html).toContain('Bonjour');
    expect(html).toContain('monde');
    expect(html).toContain('decoration-dotted');
  });
});
