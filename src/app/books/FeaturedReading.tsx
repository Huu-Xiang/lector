import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { firstChapter, pickLocalized, type PublicBook } from '@/lib/public-books';
import { readingMinutes } from '@/lib/reading-time';

/** Ordered starting points for the levels with a curated guide. */
const featuredSlugs: Record<string, readonly string[]> = {
  'fr/B1': ['contes-du-lundi', 'lettres-de-mon-moulin', 'la-petite-fadette'],
  'es/A2': ['an-elementary-spanish-reader', 'lecturas-faciles'],
  'en/B1': ['the-wonderful-wizard-of-oz', 'daddy-long-legs', 'a-little-princess'],
};

export default async function FeaturedReading({
  language,
  languageName,
  level,
  books,
  locale,
}: {
  language: string;
  languageName: string;
  level: string;
  books: PublicBook[];
  locale: string;
}) {
  const picks = (featuredSlugs[`${language}/${level}`] ?? []).flatMap((slug) => {
    const book = books.find((candidate) => candidate.slug === slug);
    return book ? [book] : [];
  });
  if (!picks.length) return null;

  const t = await getTranslations('publicBooks');
  return (
    <section
      aria-labelledby="featured-reading"
      data-testid="featured-reading"
      className="space-y-3"
    >
      <h2 id="featured-reading" className="text-lg font-semibold">
        {t('featuredTitle', { language: languageName, level })}
      </h2>
      <p>{t('featuredIntro')}</p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {picks.map((book, index) => {
          const title = pickLocalized(book.titles, locale, book.title);
          const href = `/books/${book.language}/${book.slug}`;
          const words = firstChapter(book).join(' ').match(/\S+/g)?.length ?? 0;
          return (
            <li key={book.slug} className="flex flex-col items-start gap-2 rounded-lg border p-4">
              {index === 0 && (
                <p className="text-xs font-semibold text-muted-foreground">{t('featuredStart')}</p>
              )}
              <h3 className="font-semibold">
                <Link href={href} className="hover:underline">
                  {title}
                </Link>
              </h3>
              <p>{t(`featuredReasons.${book.slug}`)}</p>
              {words > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t('featuredReadingTime', { minutes: readingMinutes(words, language) })}
                </p>
              )}
              <Link
                href={`${href}/read`}
                className="mt-auto rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground"
              >
                {t('featuredRead')}
                <span className="sr-only"> {title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
