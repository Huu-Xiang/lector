import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { LegalShell } from '@/components/LegalLinks/shell';
import { findPublicBook, firstChapter, listPublicBooks, pickLocalized } from '@/lib/public-books';

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
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: 'Readfox', type: 'article' },
  };
}

export default async function ChapterPage({ params }: Props) {
  const { language, slug } = await params;
  const book = findPublicBook(language, slug);
  if (!book) notFound();

  const t = await getTranslations('publicBooks');
  const locale = await getLocale();
  const shown = pickLocalized(book.titles, locale, book.title);
  const bookHref = `/books/${language}/${slug}`;

  return (
    <LegalShell title={t('chapterTitle', { title: shown })}>
      <p className="-mt-3 text-muted-foreground">
        <Link href={bookHref} className="hover:underline">
          ← {t('backToBook')}
        </Link>
        {' · '}
        {t('byAuthor', { author: book.author })} · {t('level', { level: book.level })}
      </p>

      <div
        lang={language}
        className="space-y-4 font-serif text-lg leading-8"
        data-testid="book-chapter"
      >
        {firstChapter(book).map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      <div className="rounded-lg border border-primary/40 bg-muted/40 p-5">
        <p className="text-base font-semibold">{t('continueTitle')}</p>
        <p className="mt-1 text-muted-foreground">
          {t('continueBody', { count: book.lessonCount })}
        </p>
        <Link
          href="/register"
          className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground hover:opacity-90"
          data-testid="book-chapter-register"
        >
          {t('continueCta')}
        </Link>
      </div>
    </LegalShell>
  );
}
