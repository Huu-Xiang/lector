import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { LegalShell, H2 } from '@/components/LegalLinks/shell';
import {
  PUBLIC_BOOK_LANGUAGES,
  listPublicBooks,
  pickLocalized,
  type PublicBook,
} from '@/lib/public-books';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('publicBooks');
  const title = `${t('indexTitle')} | Readfox`;
  const description = t('indexMetaDescription', { count: listPublicBooks().length });
  return {
    title,
    description,
    alternates: { canonical: '/books' },
    openGraph: { title, description, url: '/books', siteName: 'Readfox', type: 'website' },
  };
}

function groupByLevel(books: PublicBook[]): Array<[string, PublicBook[]]> {
  const groups = new Map<string, PublicBook[]>();
  for (const book of books) groups.set(book.level, [...(groups.get(book.level) ?? []), book]);
  return [...groups];
}

export default async function BooksPage() {
  const t = await getTranslations('publicBooks');
  const locale = await getLocale();
  const languageName = new Intl.DisplayNames([locale], { type: 'language' });
  const books = listPublicBooks();

  return (
    <LegalShell title={t('indexTitle')} wide>
      <p className="text-muted-foreground">{t('indexIntro')}</p>
      {PUBLIC_BOOK_LANGUAGES.map((language) => {
        const own = books.filter((b) => b.language === language);
        if (own.length === 0) return null;
        return (
          <section key={language} id={language} className="space-y-3">
            <H2>
              {languageName.of(language)}{' '}
              <span className="text-sm font-normal text-muted-foreground">
                {t('bookCount', { count: own.length })}
              </span>
            </H2>
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
                        <Link
                          href={`/books/${book.language}/${book.slug}`}
                          className="hover:underline"
                        >
                          {shown}
                        </Link>
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
