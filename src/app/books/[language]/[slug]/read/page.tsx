import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import JsonLd from '@/components/JsonLd';
import { LegalShell } from '@/components/LegalLinks/shell';
import PublicLink from '@/components/PublicLink';
import { authHref, claimBookPath } from '@/lib/auth-return';
import PublicChapterReader from '@/components/PublicChapterReader';
import {
  breadcrumbJsonLd,
  findPublicBook,
  firstChapter,
  listPublicBooks,
  pickLocalized,
} from '@/lib/public-books';
import BookSource from '../../../BookSource';
import { activePublicLocalePrefix, publicAlternatesForRequest } from '@/lib/public-locale.server';
import { buildPublicTwitter, withPublicOg } from '@/lib/site-seo';

interface Props {
  params: Promise<{ language: string; slug: string }>;
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
  const languageName =
    new Intl.DisplayNames([locale], { type: 'language' }).of(language) ?? language;
  const title = t('readMetaTitle', { title: shown, language: languageName });
  const description = t('readMetaDescription', {
    title: shown,
    author: book.author,
    level: book.level,
  });
  const url = `/books/${language}/${slug}/read`;
  const { alternates, canonicalUrl } = await publicAlternatesForRequest(url);
  const coverImage = book.cover
    ? { url: book.cover.url, width: 480, height: 640, alt: book.title }
    : null;
  return {
    title,
    description,
    alternates,
    openGraph: withPublicOg(
      {
        title,
        description,
        url: canonicalUrl,
        siteName: 'Readfox',
        type: 'article',
      },
      coverImage,
    ),
    twitter: buildPublicTwitter(title, description, book.cover?.url),
  };
}

export default async function ChapterPage({ params }: Props) {
  const { language, slug } = await params;
  const book = findPublicBook(language, slug);
  if (!book) notFound();

  const [t, locale, localePrefix] = await Promise.all([
    getTranslations('publicBooks'),
    getLocale(),
    activePublicLocalePrefix(),
  ]);
  const languageName =
    new Intl.DisplayNames([locale], { type: 'language' }).of(language) ?? language;
  const shown = pickLocalized(book.titles, locale, book.title);
  const bookHref = `/books/${language}/${slug}`;
  const chapterTitle = t('chapterTitle', { title: shown });
  const singleLesson = book.lessonCount === 1;
  const registerHref = authHref('/register', claimBookPath(language, slug));

  return (
    <LegalShell title={chapterTitle}>
      <JsonLd
        data={breadcrumbJsonLd(
          [
            { name: t('allBooks'), path: '/books' },
            { name: t('languageBooks', { language: languageName }), path: `/books/${language}` },
            { name: shown, path: bookHref },
            { name: chapterTitle, path: `${bookHref}/read` },
          ],
          localePrefix,
        )}
      />
      <p className="-mt-3 text-muted-foreground">
        <PublicLink href={bookHref} className="hover:underline">
          ← {t('backToBook')}
        </PublicLink>
        {' · '}
        {t('byAuthor', { author: book.author })} · {t('level', { level: book.level })}
      </p>

      <PublicChapterReader
        language={language}
        paragraphs={firstChapter(book)}
        hardWords={book.hardWords}
        registerHref={registerHref}
      />

      <p className="text-xs text-muted-foreground">
        <BookSource source={book.source} />
      </p>

      <div className="rounded-lg border border-primary/40 bg-muted/40 p-5">
        <p className="text-base font-semibold">
          {t(singleLesson ? 'singleLessonTitle' : 'continueTitle')}
        </p>
        <p className="mt-1 text-muted-foreground">
          {singleLesson ? t('ctaNote') : t('continueBody', { count: book.lessonCount })}
        </p>
        <Link
          href={registerHref}
          className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground hover:opacity-90"
          data-testid="book-chapter-register"
        >
          {t(singleLesson ? 'singleLessonCta' : 'continueCta')}
        </Link>
      </div>
    </LegalShell>
  );
}
