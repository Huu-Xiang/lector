'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { getLibraryCatalog, getSetting } from './data-layer';
import { nativeLanguageFromLocale } from './languages';

const BOOK_ID = /^library-([a-z]{2,3})-(.+)$/;

interface BookTitles {
  original: string;
  titles: Record<string, string>;
}

const catalogs = new Map<string, Promise<Map<string, BookTitles>>>();
let nativePromise: Promise<string | undefined> | null = null;

function loadCatalog(language: string): Promise<Map<string, BookTitles>> {
  let promise = catalogs.get(language);
  if (!promise) {
    promise = getLibraryCatalog(language)
      .then((books) => new Map(books.map((b) => [b.slug, { original: b.title, titles: b.titles }])))
      .catch(() => {
        catalogs.delete(language);
        return new Map<string, BookTitles>();
      });
    catalogs.set(language, promise);
  }
  return promise;
}

function loadNative(): Promise<string | undefined> {
  nativePromise ??= getSetting<string>('nativeLanguage').catch(() => undefined);
  return nativePromise;
}

/** Only an untouched title is swapped, so a title the reader renamed stays as typed. */
export function translatedBookTitle(
  title: string,
  book: BookTitles | undefined,
  native: string,
): string {
  if (!book || book.original !== title) return title;
  return book.titles[native] || title;
}

/** Title of a collection; a free-library book shows its native-language title. */
export function useLibraryBookTitle(collection: { id: string; title: string }): string {
  const locale = useLocale();
  const [shown, setShown] = useState(collection.title);
  const match = BOOK_ID.exec(collection.id);

  useEffect(() => {
    let cancelled = false;
    const m = BOOK_ID.exec(collection.id);
    if (!m) return;
    Promise.all([loadCatalog(m[1]), loadNative()]).then(([catalog, saved]) => {
      if (cancelled) return;
      const native = saved || nativeLanguageFromLocale(locale);
      setShown(translatedBookTitle(collection.title, catalog.get(m[2]), native));
    });
    return () => {
      cancelled = true;
    };
  }, [collection.id, collection.title, locale]);

  return match ? shown : collection.title;
}
