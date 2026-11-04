import type { SentenceSource } from '@/types';

export type SourceLine =
  | { kind: 'library'; book: string; chapter: string | null; href: string | null }
  | { kind: 'tatoeba'; href: string | null }
  | { kind: 'ai' };

const TATOEBA = 'https://tatoeba.org/en/sentences';

export function buildSourceLine(
  source: SentenceSource | undefined,
  language: string,
  locale = 'en',
): SourceLine | null {
  if (!source) return null;
  switch (source.kind) {
    case 'library': {
      const book = (source.bookTitles?.[locale] ?? source.bookTitle)?.trim();
      if (!book) return null;
      return {
        kind: 'library',
        book,
        chapter: source.chapterTitle?.trim() || null,
        href: source.bookSlug ? `/books/${language}/${source.bookSlug}` : null,
      };
    }
    case 'tatoeba': {
      let href: string | null = null;
      if (source.tatoebaId !== undefined) href = `${TATOEBA}/show/${source.tatoebaId}`;
      else if (source.tatoebaSearchText)
        href = `${TATOEBA}/search?query=${encodeURIComponent(source.tatoebaSearchText)}`;
      return { kind: 'tatoeba', href };
    }
    case 'ai':
      return { kind: 'ai' };
    default:
      return null;
  }
}
