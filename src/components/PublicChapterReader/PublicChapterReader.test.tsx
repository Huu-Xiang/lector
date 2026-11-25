import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import PublicChapterReader, { extractWordAtOffset } from './index';

describe('PublicChapterReader', () => {
  it('renders clean SSR paragraphs without per-word button DOM bloat', () => {
    const html = renderToStaticMarkup(
      <PublicChapterReader
        language="fr"
        paragraphs={['Bonjour le monde.', "C'est un beau jour."]}
        hardWords={['monde']}
        registerHref="/register?next=%2Fclaim-book%3Fbook%3Dtest%26lang%3Dfr"
      />,
    );

    expect(html).toContain('data-testid="book-chapter"');
    expect(html).toContain('<p tabindex="0">Bonjour le monde.</p>');
    expect(html).toContain('<p tabindex="0">C&#x27;est un beau jour.</p>');
    expect(html).not.toContain('<button');
  });

  it('expands only the keyboard-focused paragraph into native word buttons', () => {
    const html = renderToStaticMarkup(
      <PublicChapterReader
        language="fr"
        paragraphs={['Bonjour le monde.', "C'est un beau jour."]}
        hardWords={['monde']}
        registerHref="/register?next=%2Fclaim-book%3Fbook%3Dtest%26lang%3Dfr"
        initialActiveParagraph={0}
      />,
    );

    expect(html).toContain('<button type="button"');
    expect(html).toContain('decoration-dotted');
    expect(html).toContain('>Bonjour</button>');
    expect(html).toContain('>monde</button>');
    // Non-active paragraph remains plain text without per-word buttons.
    expect(html).toContain('<p tabindex="0">C&#x27;est un beau jour.</p>');
  });

  it('extracts the word at a character offset for click delegation', () => {
    expect(extractWordAtOffset('Bonjour le monde.', 0)).toBe('Bonjour');
    expect(extractWordAtOffset('Bonjour le monde.', 12)).toBe('monde');
    expect(extractWordAtOffset("C'est bien-être!", 2)).toBe("C'est");
    expect(extractWordAtOffset("C'est bien-être!", 11)).toBe('bien-être');
    expect(extractWordAtOffset('Bonjour   monde.', 8)).toBeNull();
    expect(extractWordAtOffset('Bonjour!', 8)).toBeNull();
  });
});
