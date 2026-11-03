import Link from 'next/link';
import { pickLocalized, type PublicBook } from '@/lib/public-books';

/** Titles in the interface language, with the original title after them. */
export default function BookList({ books, locale }: { books: PublicBook[]; locale: string }) {
  return (
    <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
      {books.map((book) => {
        const shown = pickLocalized(book.titles, locale, book.title);
        return (
          <li key={`${book.language}/${book.slug}`}>
            <Link href={`/books/${book.language}/${book.slug}`} className="hover:underline">
              {shown}
            </Link>
            {shown !== book.title && <span className="text-muted-foreground"> · {book.title}</span>}
          </li>
        );
      })}
    </ul>
  );
}
