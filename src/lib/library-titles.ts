'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useArticleDescriptions } from './article-descriptions';
import { loadCatalog as fetchCatalog } from './catalog-cache';
import { getSetting, setSetting } from './data-layer';
import { displayLanguage } from './display-language';
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
  if (!nativePromise) {
    const request = getSetting<string>('nativeLanguage').catch(() => undefined);
    nativePromise = request;
    // A failed or empty read is not remembered, so a later sign-in is not stuck with it.
    void request.then((saved) => {
      if (!saved && nativePromise === request) nativePromise = null;
    });
  }
  return nativePromise;
}

/** Call after the native language changes so the next read sees the new one. */
export function forgetNative(): void {
  nativePromise = null;
}

const NATIVE_CHANGED = 'readfox-native-language-changed';

/** Saves the native language and tells mounted components, so titles update without a reload. */
export async function saveNativeLanguage(code: string): Promise<void> {
  await setSetting('nativeLanguage', code);
  forgetNative();
  window.dispatchEvent(new CustomEvent(NATIVE_CHANGED, { detail: code }));
}

/** The reader's native language; follows `saveNativeLanguage` live. */
export function useNativeLanguage(): string {
  const locale = useLocale();
  const [native, setNative] = useState(() => nativeLanguageFromLocale(locale));
  useEffect(() => {
    let cancelled = false;
    loadNative().then((saved) => {
      if (!cancelled) setNative(saved || nativeLanguageFromLocale(locale));
    });
    const onChange = (event: Event) => {
      const code = (event as CustomEvent<string>).detail;
      if (code) setNative(code);
    };
    window.addEventListener(NATIVE_CHANGED, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(NATIVE_CHANGED, onChange);
    };
  }, [locale]);
  return native;
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
  const native = useDisplayLanguage();
  const [catalogMaps, setCatalogMaps] = useState<Map<string, Map<string, BookTitles>> | null>(null);
  const languages = [...new Set(collections.flatMap((c) => BOOK_ID.exec(c.id)?.[1] ?? []))].sort();
  const languageKey = languages.join(',');

  useEffect(() => {
    if (!languageKey) return;
    let cancelled = false;
    Promise.all(languageKey.split(',').map(loadCatalog)).then((maps) => {
      if (cancelled) return;
      setCatalogMaps(new Map(languageKey.split(',').map((code, i) => [code, maps[i]])));
    });
    return () => {
      cancelled = true;
    };
  }, [languageKey]);

  return useCallback(
    (collection: { id: string; title: string }) => {
      const match = BOOK_ID.exec(collection.id);
      if (!match || !catalogMaps) return collection.title;
      return translatedBookTitle(
        collection.title,
        catalogMaps.get(match[1])?.get(match[2]),
        native,
      );
    },
    [catalogMaps, native],
  );
}

/** The language shown for titles and descriptions: see `displayLanguage`. */
export function useDisplayLanguage(): string {
  const native = useNativeLanguage();
  const locale = useLocale();
  return displayLanguage(native, locale);
}

const STARTER_COLLECTION = /^starter-[a-z]{2,3}$/;

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
  const book = BOOK_ID.exec(collection.id);
  const articleId = FEED_COLLECTION.exec(collection.id)?.[1] ?? null;
  const native = useDisplayLanguage();
  const t = useTranslations('library');
  const [entry, setEntry] = useState<BookTitles | undefined>();

  useEffect(() => {
    let cancelled = false;
    const m = BOOK_ID.exec(collection.id);
    (m ? loadCatalog(m[1]) : Promise.resolve(null)).then((catalog) => {
      if (cancelled) return;
      setEntry(m && catalog ? catalog.get(m[2]) : undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [collection.id]);

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
  const description = STARTER_COLLECTION.test(collection.id) ? t('starterBlurb') : null;
  return { title: collection.title, original: null, description };
}
