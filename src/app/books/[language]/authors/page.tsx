import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { LegalShell } from '@/components/LegalLinks/shell';
import {
  AUTHOR_PAGE_MIN_BOOKS,
  authorsOf,
  booksByAuthor,
  PUBLIC_BOOK_LANGUAGES,
  type PublicBookLanguage,
} from '@/lib/public-books';

interface Props {
  params: Promise<{ language: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return PUBLIC_BOOK_LANGUAGES.filter((language) => authorsOf(language).length > 0).map(
    (language) => ({ language }),
  );
}

async function load(params: Props['params']) {
  const { language } = await params;
  if (!PUBLIC_BOOK_LANGUAGES.includes(language as PublicBookLanguage)) notFound();
  const authors = authorsOf(language);
  if (authors.length === 0) notFound();
  const locale = await getLocale();
  const languageName =
    new Intl.DisplayNames([locale], { type: 'language' }).of(language) ?? language;
  return { language, authors, languageName };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { language, authors, languageName } = await load(params);
  const t = await getTranslations('publicBooks');
  const title = `${t('authorsTitle', { language: languageName })} | Readfox`;
  const description = t('authorsMetaDescription', {
    count: authors.length,
    language: languageName,
    first: authors[0].name,
    last: authors[authors.length - 1].name,
  });
  const url = `/books/${language}/authors`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: 'Readfox', type: 'website' },
  };
}

export default async function AuthorsPage({ params }: Props) {
  const { language, authors, languageName } = await load(params);
  const t = await getTranslations('publicBooks');
  return (
    <LegalShell title={t('authorsTitle', { language: languageName })} wide>
      <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {authors.map((author) => {
          const href =
            author.count >= AUTHOR_PAGE_MIN_BOOKS
              ? `/books/${language}/author/${author.slug}`
              : `/books/${language}/${booksByAuthor(language, author.slug)[0].slug}`;
          return (
            <li key={author.slug}>
              <Link href={href} className="hover:underline">
                {author.name}
              </Link>
              <span className="text-muted-foreground">
                {' '}
                · {t('bookCount', { count: author.count })}
              </span>
            </li>
          );
        })}
      </ul>
      <p>
        <Link href={`/books#${language}`} className="underline">
          {t('allBooks')}
        </Link>
      </p>
    </LegalShell>
  );
}
