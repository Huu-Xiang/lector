import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { LegalShell } from '@/components/LegalLinks/shell';
import {
  AUTHOR_PAGE_MIN_BOOKS,
  authorsOf,
  booksByAuthor,
  pickLocalized,
  PUBLIC_BOOK_LANGUAGES,
} from '@/lib/public-books';
import BookList from '../../../BookList';

interface Props {
  params: Promise<{ language: string; author: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return PUBLIC_BOOK_LANGUAGES.flatMap((language) =>
    authorsOf(language)
      .filter((a) => a.count >= AUTHOR_PAGE_MIN_BOOKS)
      .map((a) => ({ language, author: a.slug })),
  );
}

async function load(params: Props['params']) {
  const { language, author } = await params;
  const slug = decodeURIComponent(author);
  const books = booksByAuthor(language, slug);
  if (books.length < AUTHOR_PAGE_MIN_BOOKS) notFound();
  const locale = await getLocale();
  const languageName =
    new Intl.DisplayNames([locale], { type: 'language' }).of(language) ?? language;
  return { language, slug, name: books[0].author, books, locale, languageName };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { language, slug, name, books, locale, languageName } = await load(params);
  const t = await getTranslations('publicBooks');
  const title = `${t('authorTitle', { author: name, language: languageName })} | Readfox`;
  const titles = books
    .slice(0, 5)
    .map((b) => pickLocalized(b.titles, locale, b.title))
    .join(', ');
  const description = t('authorMetaDescription', {
    author: name,
    count: books.length,
    language: languageName,
    titles,
  });
  const url = `/books/${language}/author/${slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: 'Readfox', type: 'profile' },
  };
}

export default async function AuthorPage({ params }: Props) {
  const { language, name, books, locale, languageName } = await load(params);
  const t = await getTranslations('publicBooks');
  return (
    <LegalShell title={t('authorTitle', { author: name, language: languageName })} wide>
      <p className="text-muted-foreground">
        {t('authorIntro', { author: name, count: books.length })}
      </p>
      <BookList books={books} locale={locale} />
      <p className="flex flex-wrap gap-x-4">
        <Link href={`/books/${language}/authors`} className="underline">
          {t('browseAuthors')}
        </Link>
        <Link href={`/books#${language}`} className="underline">
          {t('allBooks')}
        </Link>
      </p>
    </LegalShell>
  );
}
