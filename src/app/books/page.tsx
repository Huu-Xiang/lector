import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import JsonLd from '@/components/JsonLd';
import { LegalShell, H2 } from '@/components/LegalLinks/shell';
import PublicLink from '@/components/PublicLink';
import {
  PUBLIC_BOOK_LANGUAGES,
  bookListJsonLd,
  levelSlug,
  listPublicBooks,
  pickLocalized,
  type PublicBook,
} from '@/lib/public-books';
import { publicUrl } from '@/lib/public-locale';
import { activePublicLocalePrefix, publicAlternatesForRequest } from '@/lib/public-locale.server';
import { buildPublicTwitter, withPublicOg } from '@/lib/site-seo';

export async function generateMetadata(): Promise<Metadata> {
  const [t, { alternates, canonicalUrl }] = await Promise.all([
    getTranslations('publicBooks'),
    publicAlternatesForRequest('/books'),
  ]);
  const title = `${t('indexTitle')} | Readfox`;
  const description = t('indexMetaDescription', { count: listPublicBooks().length });
  return {
    title,
    description,
    alternates,
    openGraph: withPublicOg({
      title,
      description,
      url: canonicalUrl,
      siteName: 'Readfox',
      type: 'website',
    }),
    twitter: buildPublicTwitter(title, description),
  };
}

function groupByLevel(books: PublicBook[]): Array<[string, PublicBook[]]> {
  const groups = new Map<string, PublicBook[]>();
  for (const book of books) groups.set(book.level, [...(groups.get(book.level) ?? []), book]);
  return [...groups];
}

export default async function BooksPage() {
  const [t, tv, locale, localePrefix] = await Promise.all([
    getTranslations('publicBooks'),
    getTranslations('vocabTest'),
    getLocale(),
    activePublicLocalePrefix(),
  ]);
  const languageName = new Intl.DisplayNames([locale], { type: 'language' });
  const books = listPublicBooks();
  const title = t('indexTitle');
  const description = t('indexMetaDescription', { count: books.length });
  const collectionJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description,
    url: publicUrl('/books', localePrefix),
    inLanguage: locale,
  };

  return (
    <LegalShell title={title} wide>
      <JsonLd data={collectionJsonLd} />
      <JsonLd data={bookListJsonLd(title, '/books', books, localePrefix)} />
      <p className="text-muted-foreground">{t('indexIntro')}</p>
      <p>
        <PublicLink
          href="/vocab-test"
          data-testid="books-vocab-test-link"
          className="underline hover:text-foreground"
        >
          {tv('booksLink')}
        </PublicLink>
      </p>
      {PUBLIC_BOOK_LANGUAGES.map((language) => {
        const own = books.filter((b) => b.language === language);
        if (own.length === 0) return null;
        return (
          <section key={language} id={language} className="space-y-3">
            <H2>
              <PublicLink href={`/books/${language}`} className="hover:underline">
                {languageName.of(language)}
              </PublicLink>{' '}
              <span className="text-sm font-normal text-muted-foreground">
                {t('bookCount', { count: own.length })}
              </span>
            </H2>
            <p className="flex flex-wrap gap-x-3 text-muted-foreground">
              <span>{t('browseLevels')}:</span>
              {groupByLevel(own).map(([level]) => (
                <PublicLink
                  key={level}
                  href={`/books/${language}/level/${levelSlug(level)}`}
                  className="underline hover:text-foreground"
                >
                  {level}
                </PublicLink>
              ))}
              <PublicLink
                href={`/books/${language}/authors`}
                className="underline hover:text-foreground"
              >
                {t('browseAuthors')}
              </PublicLink>
            </p>
            {groupByLevel(own).map(([level, group]) => (
              <div key={level}>
                <h3 className="mb-1 text-sm font-semibold text-muted-foreground">
                  {t('level', { level })}
                </h3>
                <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                  {group.map((book) => {
                    const shown = pickLocalized(book.titles, locale, book.title);
                    return (
                      <li key={book.slug}>
                        <PublicLink
                          href={`/books/${book.language}/${book.slug}`}
                          className="hover:underline"
                        >
                          {shown}
                        </PublicLink>
                        {shown !== book.title && (
                          <span className="text-muted-foreground"> · {book.title}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </LegalShell>
  );
}
