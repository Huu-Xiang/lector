import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import JsonLd from '@/components/JsonLd';
import { LegalShell } from '@/components/LegalLinks/shell';
import {
  bookListJsonLd,
  booksAtLevel,
  breadcrumbJsonLd,
  levelSlug,
  listPublicBooks,
  neighbourLevels,
  pickLocalized,
} from '@/lib/public-books';
import BookDetailList from '../../../BookDetailList';

interface Props {
  params: Promise<{ language: string; level: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  const seen = new Set<string>();
  for (const book of listPublicBooks()) seen.add(`${book.language}/${levelSlug(book.level)}`);
  return [...seen].map((key) => {
    const [language, level] = key.split('/');
    return { language, level };
  });
}

async function load(params: Props['params']) {
  const { language, level } = await params;
  const books = booksAtLevel(language, level);
  if (books.length === 0) notFound();
  const locale = await getLocale();
  const languageName =
    new Intl.DisplayNames([locale], { type: 'language' }).of(language) ?? language;
  return { language, level: books[0].level, books, locale, languageName };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { language, level, books, locale, languageName } = await load(params);
  const t = await getTranslations('publicBooks');
  const title = t('levelMetaTitle', { language: languageName, level });
  const titles = books
    .slice(0, 5)
    .map((b) => pickLocalized(b.titles, locale, b.title))
    .join(', ');
  const description = t('levelMetaDescription', { language: languageName, level, titles });
  const url = `/books/${language}/level/${levelSlug(level)}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: 'Readfox', type: 'website' },
  };
}

export default async function LevelPage({ params }: Props) {
  const { language, level, books, locale, languageName } = await load(params);
  const t = await getTranslations('publicBooks');
  const title = t('levelTitle', { language: languageName, level });
  const path = `/books/${language}/level/${levelSlug(level)}`;
  const { easier, harder } = neighbourLevels(language, level);
  const neighbours = [
    { label: t('easierLevel'), level: easier },
    { label: t('harderLevel'), level: harder },
  ].filter((n): n is { label: string; level: string } => n.level !== null);
  return (
    <LegalShell title={title} wide>
      <JsonLd data={bookListJsonLd(title, path, books)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: t('allBooks'), path: '/books' },
          { name: t('languageBooks', { language: languageName }), path: `/books/${language}` },
          { name: title, path },
        ])}
      />
      <p className="text-muted-foreground">
        {t('levelIntro', { count: books.length, language: languageName, level })}
      </p>
      <p>{t(`levelAbout.${level}` as 'levelAbout.A1', { language: languageName })}</p>
      <BookDetailList books={books} locale={locale} />
      {neighbours.length > 0 && (
        <nav aria-label={t('otherLevels')} className="flex flex-wrap gap-x-4">
          {neighbours.map((n) => (
            <Link
              key={n.level}
              href={`/books/${language}/level/${levelSlug(n.level)}`}
              className="underline"
            >
              {n.label}: {t('levelTitle', { language: languageName, level: n.level })}
            </Link>
          ))}
        </nav>
      )}
      <p className="flex flex-wrap gap-x-4">
        <Link href={`/books/${language}`} className="underline">
          {t('languageBooks', { language: languageName })}
        </Link>
        <Link href={`/books/${language}/authors`} className="underline">
          {t('browseAuthors')}
        </Link>
        <Link href="/books" className="underline">
          {t('allBooks')}
        </Link>
      </p>
    </LegalShell>
  );
}
