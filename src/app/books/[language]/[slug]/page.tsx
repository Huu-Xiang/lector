import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { LegalShell, H2 } from '@/components/LegalLinks/shell';
import {
  bookOpening,
  findPublicBook,
  listPublicBooks,
  pickLocalized,
  readingHours,
} from '@/lib/public-books';

interface Props {
  params: Promise<{ language: string; slug: string }>;
}

const RELATED = 8;

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
  const related = listPublicBooks()
    .filter((b) => b.language === book.language && b.level === book.level && b.slug !== slug)
    .slice(0, RELATED);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: book.title,
    author: { '@type': 'Person', name: book.author },
    inLanguage: language,
    isAccessibleForFree: true,
    url: `https://readfox.app/books/${language}/${slug}`,
    ...(blurb ? { description: blurb } : {}),
  };

  return (
    <LegalShell title={shown}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <div className="-mt-3 space-y-1 text-muted-foreground">
        {shown !== book.title && <p className="text-base text-foreground">{book.title}</p>}
        <p>{t('byAuthor', { author: book.author })}</p>
        <p className="flex flex-wrap gap-x-3">
          <span className="rounded bg-muted px-1.5 font-medium text-foreground">
            {t('level', { level: book.level })}
          </span>
          <span>{languageName}</span>
          <span>{t('lessons', { count: book.lessonCount })}</span>
          <span>
            {hours >= 1
              ? t('readingHours', { hours: Math.round(hours) })
              : t('readingMinutes', { minutes: Math.max(5, Math.round(hours * 60)) })}
          </span>
        </p>
      </div>

      {blurb && <p className="text-base">{blurb}</p>}

      <div className="rounded-lg border bg-muted/40 p-4">
        <Link
          href="/register"
          className="inline-block rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground hover:opacity-90"
        >
          {t('readFree')}
        </Link>
        <p className="mt-2 text-muted-foreground">{t('ctaNote')}</p>
      </div>

      <H2>{t('opening')}</H2>
      <div lang={language} className="space-y-3 font-serif text-base leading-7">
        {bookOpening(book).map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

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
