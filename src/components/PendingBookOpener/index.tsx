'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { addLibraryBook } from '@/lib/data-layer';
import { readLanguageCache } from '@/lib/language-cache';
import { readPendingBook, writePendingBook } from '@/lib/pending-book';

/** Opens the book a visitor chose on a public book page, once they reach the library. */
export default function PendingBookOpener() {
  const router = useRouter();

  useEffect(() => {
    const book = readPendingBook();
    if (!book) return;
    writePendingBook(null);
    if (book.language !== readLanguageCache()) return;
    addLibraryBook(book.language, book.slug)
      .then((collectionId) => router.push(`/collection/${collectionId}`))
      .catch(() => {});
  }, [router]);

  return null;
}
