import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import JsonLd from '@/components/JsonLd';
import { registerHrefForBook } from '@/lib/pending-book';
import { LegalShell, H2 } from '@/components/LegalLinks/shell';
import {
  AUTHOR_PAGE_MIN_BOOKS,
  SITE_ORIGIN,
  authorSlug,
  bookOpening,
  bookUrl,
  booksByAuthor,
  findPublicBook,
  levelSlug,
  listPublicBooks,
  pickLocalized,
  readingDuration,
  readingHours,
} from '@/lib/public-books';

interface Props {
  params: Promise<{ language: string; slug: string }>;
}

const RELATED = 8;

function bookJsonLd(book: NonNullable<ReturnType<typeof findPublicBook>>) {
  const ccBySa = /CC BY-SA 4\.0/i.test(book.source.license);
  return {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: book.title,
    author: { '@type': 'Person', name: book.author },
    inLanguage: book.language,
    url: bookUrl(book),
    isAccessibleForFree: true,
    educationalLevel: book.level,
    wordCount: book.wordCount,
    timeRequired: readingDuration(book),
    license: ccBySa
      ? 'https://creativecommons.org/licenses/by-sa/4.0/'
      : 'https://creativecommons.org/publicdomain/mark/1.0/',
    copyrightNotice: book.source.license,
    ...(book.source.url ? { isBasedOn: book.source.url } : {}),
    ...(book.cover ? { image: `${SITE_ORIGIN}${book.cover.url}` } : {}),
  };
}

export const dynamicParams = false;

export function generateStaticParams() {
  return listPublicBooks().map((book) => ({ language: book.language, slug: book.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { language, slug } = await params;
  const book = findPublicBook(language, slug);
  if (!book) notFound();
  const t = await getTranslations('publicBooks');
  const locale = await getLocale();
  const shown = pickLocalized(book.titles, locale, book.title);
  const title = t('metaTitle', {
    title: shown === book.title ? book.title : `${shown} · ${book.title}`,
    author: book.author,
    language: new Intl.DisplayNames([locale], { type: 'language' }).of(language) ?? language,
  });
  const description = pickLocalized(book.blurbs, locale);
  const url = `/books/${language}/${slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: 'Readfox', type: 'book' },
  };
}

export default async function BookPage({ params }: Props) {
  const { language, slug } = await params;
  const book = findPublicBook(language, slug);
  if (!book) notFound();

  const t = await getTranslations('publicBooks');
  const locale = await getLocale();
  const languageName =
    new Intl.DisplayNames([locale], { type: 'language' }).of(language) ?? language;
  const shown = pickLocalized(book.titles, locale, book.title);
  const blurb = pickLocalized(book.blurbs, locale);
  const hours = readingHours(book);
  const authorBooks = booksByAuthor(language, authorSlug(book.author)).length;
  const readHref = `/books/${language}/${slug}/read`;
  const related = listPublicBooks()
    .filter((b) => b.language === book.language && b.level === book.level && b.slug !== slug)
    .slice(0, RELATED);
  const jsonLd = {
    ...bookJsonLd(book),
    ...(blurb ? { description: blurb } : {}),
  };
  const levelPath = `/books/${language}/level/${levelSlug(book.level)}`;
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: t('allBooks'), item: `${SITE_ORIGIN}/books` },
      {
        name: t('levelTitle', { language: languageName, level: book.level }),
        item: `${SITE_ORIGIN}${levelPath}`,
      },
      { name: shown, item: bookUrl(book) },
    ].map((entry, i) => ({ '@type': 'ListItem', position: i + 1, ...entry })),
  };

  return (
    <LegalShell title={shown}>
      <JsonLd data={jsonLd} />
      <JsonLd data={breadcrumb} />
      <div className="-mt-3 flex items-start gap-4">
        <div className="min-w-0 flex-1 space-y-1 text-muted-foreground">
          {shown !== book.title && <p className="text-base text-foreground">{book.title}</p>}
          <p>
            {authorBooks >= AUTHOR_PAGE_MIN_BOOKS ? (
              <Link
                href={`/books/${language}/author/${authorSlug(book.author)}`}
                className="hover:underline"
              >
                {t('byAuthor', { author: book.author })}
              </Link>
            ) : (
              t('byAuthor', { author: book.author })
            )}
          </p>
          <p className="flex flex-wrap gap-x-3">
            <Link
              href={levelPath}
              className="rounded bg-muted px-1.5 font-medium text-foreground hover:underline"
            >
              {t('level', { level: book.level })}
            </Link>
            <span>{languageName}</span>
            <span>{t('lessons', { count: book.lessonCount })}</span>
            <span>
              {hours >= 1
                ? t('readingHours', { hours: Math.round(hours) })
                : t('readingMinutes', { minutes: Math.max(5, Math.round(hours * 60)) })}
            </span>
          </p>
        </div>
        {book.cover && (
          <img
            src={book.cover.url}
            alt={t('coverAlt', { title: book.title })}
            width={480}
            height={640}
            data-testid="book-cover"
            className="aspect-[3/4] h-auto w-24 shrink-0 rounded-md border object-cover shadow-sm sm:w-32"
          />
        )}
      </div>

      {blurb && <p className="text-base">{blurb}</p>}

      <div className="rounded-lg border bg-muted/40 p-4">
        <div className="flex flex-wrap gap-2">
          <Link
            href={readHref}
            className="inline-block rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground hover:opacity-90"
            data-testid="book-try-read"
          >
            {t('tryRead')}
          </Link>
          <Link
            href={registerHrefForBook({ language, slug })}
            className="inline-block rounded-lg border border-border bg-card px-4 py-2 font-semibold text-foreground hover:bg-muted"
            data-testid="book-register"
          >
            {t('readFree')}
          </Link>
        </div>
        <p className="mt-2 text-muted-foreground">{t('ctaNote')}</p>
      </div>

      {book.hardWords.length > 0 && (
        <section data-testid="book-hard-words">
          <H2>{t('hardWordsTitle')}</H2>
          <p className="mb-2 text-muted-foreground">
            {t('hardWordsNote', { count: book.hardWords.length, language: languageName })}
          </p>
          <ul lang={language} className="flex flex-wrap gap-1.5">
            {book.hardWords.map((word) => (
              <li key={word} className="rounded bg-muted px-1.5 py-0.5 text-sm text-foreground">
                {word}
              </li>
            ))}
          </ul>
        </section>
      )}

      <H2>{t('opening')}</H2>
      <div lang={language} className="space-y-3 font-serif text-base leading-7">
        {bookOpening(book).map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
      <p>
        <Link href={readHref} className="font-medium text-primary hover:underline">
          {t('readWholeChapter')} →
        </Link>
      </p>

      <p className="text-xs text-muted-foreground">
        {t.rich('source', {
          source: book.source.name,
          link: (chunks) => (
            <a
              className="underline"
              href={book.source.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {chunks}
            </a>
          ),
          license: book.source.license,
        })}
        {book.cover?.credit && (
          <>
            {' '}
            {t.rich('coverCredit', {
              credit: book.cover.credit,
              link: (chunks) =>
                book.cover?.source ? (
                  <a
                    className="underline"
                    href={book.cover.source}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {chunks}
                  </a>
                ) : (
                  chunks
                ),
            })}
          </>
        )}
      </p>

      {related.length > 0 && (
        <>
          <H2>{t('moreAtLevel', { language: languageName, level: book.level })}</H2>
          <ul className="grid gap-1 sm:grid-cols-2">
            {related.map((b) => (
              <li key={b.slug}>
                <Link href={`/books/${b.language}/${b.slug}`} className="hover:underline">
                  {pickLocalized(b.titles, locale, b.title)}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <p>
        <Link href={`/books#${language}`} className="underline">
          {t('allBooks')}
        </Link>
      </p>
    </LegalShell>
  );
}
