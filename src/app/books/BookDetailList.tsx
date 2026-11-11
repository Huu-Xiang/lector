import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { pickLocalized, type PublicBook } from '@/lib/public-books';

/** Book links with the author and the lesson count under each title. */
export default async function BookDetailList({
  books,
  locale,
}: {
  books: PublicBook[];
  locale: string;
}) {
  const t = await getTranslations('publicBooks');
  return (
    <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {books.map((book) => {
        const shown = pickLocalized(book.titles, locale, book.title);
        return (
          <li key={`${book.language}/${book.slug}`}>
            <Link href={`/books/${book.language}/${book.slug}`} className="hover:underline">
              {shown}
            </Link>
            {shown !== book.title && <span className="text-muted-foreground"> · {book.title}</span>}
            <p className="text-xs text-muted-foreground">
              {t('bookDetail', { author: book.author, lessons: book.lessonCount })}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
