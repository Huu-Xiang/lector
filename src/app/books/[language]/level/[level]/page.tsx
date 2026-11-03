import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { LegalShell } from '@/components/LegalLinks/shell';
import { booksAtLevel, levelSlug, listPublicBooks, pickLocalized } from '@/lib/public-books';
import BookList from '../../../BookList';

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
  const title = `${t('levelTitle', { language: languageName, level })} | Readfox`;
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
  return (
    <LegalShell title={t('levelTitle', { language: languageName, level })} wide>
      <p className="text-muted-foreground">
        {t('levelIntro', { count: books.length, language: languageName, level })}
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
