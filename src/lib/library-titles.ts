'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { useArticleDescriptions } from './article-descriptions';
import { loadCatalog as fetchCatalog } from './catalog-cache';
import { getSetting } from './data-layer';
import { nativeLanguageFromLocale } from './languages';

const BOOK_ID = /^library-([a-z]{2,3})-(.+)$/;

interface BookTitles {
  original: string;
  titles: Record<string, string>;
  blurbs: Record<string, string>;
}

const catalogs = new Map<string, Promise<Map<string, BookTitles>>>();
let nativePromise: Promise<string | undefined> | null = null;

function loadCatalog(language: string): Promise<Map<string, BookTitles>> {
  let promise = catalogs.get(language);
  if (!promise) {
    promise = fetchCatalog(language)
      .then(
        (books) =>
          new Map(
            books.map((b) => [b.slug, { original: b.title, titles: b.titles, blurbs: b.blurbs }]),
          ),
      )
      .catch(() => {
        catalogs.delete(language);
        return new Map<string, BookTitles>();
      });
    catalogs.set(language, promise);
  }
  return promise;
}

export function loadNative(): Promise<string | undefined> {
  nativePromise ??= getSetting<string>('nativeLanguage').catch(() => undefined);
  return nativePromise;
}

/** Call after the native language changes so the next read sees the new one. */
export function forgetNative(): void {
  nativePromise = null;
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

/** A title resolver for a list of collections, such as the vocab page filter. */
export function useLibraryTitleResolver(
  collections: ReadonlyArray<{ id: string; title: string }>,
): (collection: { id: string; title: string }) => string {
  const locale = useLocale();
  const [state, setState] = useState<{
    native: string;
    catalogs: Map<string, Map<string, BookTitles>>;
  } | null>(null);
  const languages = [...new Set(collections.flatMap((c) => BOOK_ID.exec(c.id)?.[1] ?? []))].sort();
  const languageKey = languages.join(',');

  useEffect(() => {
    if (!languageKey) return;
    let cancelled = false;
    Promise.all([Promise.all(languageKey.split(',').map(loadCatalog)), loadNative()]).then(
      ([maps, saved]) => {
        if (cancelled) return;
        const catalogs = new Map(languageKey.split(',').map((code, i) => [code, maps[i]]));
        setState({ native: saved || nativeLanguageFromLocale(locale), catalogs });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [languageKey, locale]);

  return useCallback(
    (collection: { id: string; title: string }) => {
      const match = BOOK_ID.exec(collection.id);
      if (!match || !state) return collection.title;
      return translatedBookTitle(
        collection.title,
        state.catalogs.get(match[1])?.get(match[2]),
        state.native,
      );
    },
    [state],
  );
}

const FEED_COLLECTION = /^reading-feed-(reading-feed-[0-9a-f]+)$/;

export interface CollectionDisplay {
  title: string;
  /** The original title when `title` is a translation. */
  original: string | null;
  description: string | null;
}

/** What a library card shows: native-language title and description for free books and feed articles. */
export function useCollectionDisplay(collection: {
  id: string;
  title: string;
  language?: string;
}): CollectionDisplay {
  const locale = useLocale();
  const book = BOOK_ID.exec(collection.id);
  const articleId = FEED_COLLECTION.exec(collection.id)?.[1] ?? null;
  const [native, setNative] = useState(() => nativeLanguageFromLocale(locale));
  const [entry, setEntry] = useState<BookTitles | undefined>();

  useEffect(() => {
    let cancelled = false;
    const m = BOOK_ID.exec(collection.id);
    Promise.all([m ? loadCatalog(m[1]) : null, loadNative()]).then(([catalog, saved]) => {
      if (cancelled) return;
      setNative(saved || nativeLanguageFromLocale(locale));
      setEntry(m && catalog ? catalog.get(m[2]) : undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [collection.id, locale]);

  const described = useArticleDescriptions(
    articleId ? [articleId] : [],
    native,
    collection.language ?? 'en',
  );

  if (book && entry) {
    const title = translatedBookTitle(collection.title, entry, native);
    return {
      title,
      original: title !== collection.title ? collection.title : null,
      description: entry.original === collection.title ? (entry.blurbs[native] ?? null) : null,
    };
  }
  const article = articleId ? described[articleId] : undefined;
  if (article) {
    return { title: article.title, original: collection.title, description: article.summary };
  }
  return { title: collection.title, original: null, description: null };
}
