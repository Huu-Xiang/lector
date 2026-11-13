import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import JsonLd from '@/components/JsonLd';
import { LegalShell, H2 } from '@/components/LegalLinks/shell';
import {
  PUBLIC_BOOK_LANGUAGES,
  bookListJsonLd,
  booksAtLevel,
  booksInLanguage,
  breadcrumbJsonLd,
  fitText,
  languagesWithBooks,
  levelSlug,
  levelsOf,
  pickLocalized,
  type PublicBookLanguage,
} from '@/lib/public-books';
import { UI_LOCALES } from '@/i18n/locales';
import BookDetailList from '../BookDetailList';
import BookHubLocaleButton from '../BookHubLocaleButton';

interface Props {
  params: Promise<{ language: string }>;
}

const DESCRIPTION_MAX = 155;
const TITLES_IN_DESCRIPTION = 4;

export const dynamicParams = false;

export function generateStaticParams() {
  return languagesWithBooks().map((language) => ({ language }));
}

async function load(params: Props['params']) {
  const { language } = await params;
  if (!PUBLIC_BOOK_LANGUAGES.includes(language as PublicBookLanguage)) notFound();
  const books = booksInLanguage(language);
  if (books.length === 0) notFound();
  const locale = await getLocale();
  const languageName =
    new Intl.DisplayNames([locale], { type: 'language' }).of(language) ?? language;
  const levels = levelsOf(language);
  return { language, books, levels, locale, languageName };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { language, books, levels, locale, languageName } = await load(params);
  const t = await getTranslations('publicBooks');
  const values = { language: languageName, first: levels[0], last: levels[levels.length - 1] };
  const title = t('languageMetaTitle', values);
  const titles = books
    .slice(0, TITLES_IN_DESCRIPTION)
    .map((b) => pickLocalized(b.titles, locale, b.title))
    .join(', ');
  const description = fitText(
    t('languageMetaDescription', { ...values, count: books.length, titles }),
    DESCRIPTION_MAX,
  );
  const url = `/books/${language}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: 'Readfox', type: 'website' },
  };
}

export default async function LanguageBooksPage({ params }: Props) {
  const { language, books, levels, locale, languageName } = await load(params);
  const t = await getTranslations('publicBooks');
  const title = t('languageTitle', { language: languageName });
  const path = `/books/${language}`;
  const alternateLocale =
    language === 'en'
      ? UI_LOCALES.find(({ code }) => code === (locale === 'ru' ? 'en' : 'ru'))
      : undefined;
  const others = languagesWithBooks().filter((code) => code !== language);
  return (
    <LegalShell title={title} wide>
      <JsonLd data={bookListJsonLd(title, path, books)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: t('allBooks'), path: '/books' },
          { name: t('languageBooks', { language: languageName }), path },
        ])}
      />
      <p className="text-muted-foreground">
        {t('languageIntro', {
          count: books.length,
          language: languageName,
          first: levels[0],
          last: levels[levels.length - 1],
        })}
      </p>
      <p className="flex flex-wrap gap-x-3 text-muted-foreground">
        {alternateLocale && (
          <BookHubLocaleButton code={alternateLocale.code} label={alternateLocale.native} />
        )}
        <span>{t('browseLevels')}:</span>
        {levels.map((level) => (
          <Link
            key={level}
            href={`${path}/level/${levelSlug(level)}`}
            className="underline hover:text-foreground"
          >
            {level}
          </Link>
        ))}
        <Link href={`${path}/authors`} className="underline hover:text-foreground">
          {t('browseAuthors')}
        </Link>
      </p>
      {levels.map((level) => (
        <section key={level} id={levelSlug(level)} className="space-y-2">
          <H2>
            <Link href={`${path}/level/${levelSlug(level)}`} className="hover:underline">
              {t('levelTitle', { language: languageName, level })}
            </Link>{' '}
            <span className="text-sm font-normal text-muted-foreground">
              {t('bookCount', { count: booksAtLevel(language, level).length })}
            </span>
          </H2>
          <BookDetailList books={booksAtLevel(language, level)} locale={locale} />
        </section>
      ))}
      <p className="flex flex-wrap gap-x-4">
        {others.map((code) => (
          <Link key={code} href={`/books/${code}`} className="underline">
            {t('languageBooks', {
              language: new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code,
            })}
          </Link>
        ))}
        <Link href="/books" className="underline">
          {t('allBooks')}
        </Link>
      </p>
    </LegalShell>
  );
}
