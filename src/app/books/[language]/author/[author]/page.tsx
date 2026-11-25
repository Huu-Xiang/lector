import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import JsonLd from '@/components/JsonLd';
import { LegalShell } from '@/components/LegalLinks/shell';
import PublicLink from '@/components/PublicLink';
import {
  AUTHOR_PAGE_MIN_BOOKS,
  authorsOf,
  bookListJsonLd,
  booksByAuthor,
  breadcrumbJsonLd,
  pickLocalized,
  PUBLIC_BOOK_LANGUAGES,
} from '@/lib/public-books';
import BookList from '../../../BookList';
import { publicUrl } from '@/lib/public-locale';
import { activePublicLocalePrefix, publicAlternatesForRequest } from '@/lib/public-locale.server';
import { buildPublicTwitter, withPublicOg } from '@/lib/site-seo';

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
  const url = `/books/${language}/author/${encodeURIComponent(slug)}`;
  const { alternates, canonicalUrl } = await publicAlternatesForRequest(url);
  return {
    title,
    description,
    alternates,
    openGraph: withPublicOg({
      title,
      description,
      url: canonicalUrl,
      siteName: 'Readfox',
      type: 'profile',
    }),
    twitter: buildPublicTwitter(title, description),
  };
}

export default async function AuthorPage({ params }: Props) {
  const { language, slug, name, books, locale, languageName } = await load(params);
  const [t, localePrefix] = await Promise.all([
    getTranslations('publicBooks'),
    activePublicLocalePrefix(),
  ]);
  const title = t('authorTitle', { author: name, language: languageName });
  const authorPath = `/books/${language}/author/${encodeURIComponent(slug)}`;
  const personJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name,
    url: publicUrl(authorPath, localePrefix),
  };
  return (
    <LegalShell title={title} wide>
      <JsonLd data={personJsonLd} />
      <JsonLd data={bookListJsonLd(title, authorPath, books, localePrefix)} />
      <JsonLd
        data={breadcrumbJsonLd(
          [
            { name: t('allBooks'), path: '/books' },
            { name: t('languageBooks', { language: languageName }), path: `/books/${language}` },
            {
              name: t('authorsTitle', { language: languageName }),
              path: `/books/${language}/authors`,
            },
            { name, path: authorPath },
          ],
          localePrefix,
        )}
      />
      <p className="text-muted-foreground">
        {t('authorIntro', { author: name, count: books.length })}
      </p>
      <BookList books={books} locale={locale} />
      <p className="flex flex-wrap gap-x-4">
        <PublicLink href={`/books/${language}/authors`} className="underline">
          {t('browseAuthors')}
        </PublicLink>
        <PublicLink href={`/books#${language}`} className="underline">
          {t('allBooks')}
        </PublicLink>
      </p>
    </LegalShell>
  );
}
