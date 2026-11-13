'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import BookReviewLink from '@/components/BookReviewLink';
import LevelTags from '@/components/LevelTags';
import { cachedCatalog, loadCatalog } from '@/lib/catalog-cache';
import { useShowDescriptions } from '@/lib/show-descriptions';
import { useArticleDescriptions } from '@/lib/article-descriptions';
import {
  addLibraryBook,
  addReadingFeedArticle,
  getReadingFeedCached,
  getSettingCached,
  peekReadingFeed,
  peekSettingCached,
  type LibraryBook,
  type ReadingFeedArticle,
} from '@/lib/data-layer';
import { nativeLanguageFromLocale } from '@/lib/languages';
import { displayLanguage, translationFor } from '@/lib/display-language';
import { levelGap, pickNearLevel, recommendationLevel } from '@/lib/recommend';
import type { CefrLevel } from '@/lib/reading-level';

const FEED_INTERESTS = ['news', 'travel', 'science'] as const;
type FeedInterest = (typeof FEED_INTERESTS)[number];

interface Pick {
  key: string;
  title: string;
  original: string | null;
  blurb: string | null;
  level: string;
  words: number;
  source: string | null;
  interest: FeedInterest | null;
  harder: boolean;
  articleId: string | null;
  bookTitle: string | null;
  bookAuthor: string | null;
  add: () => Promise<string>;
}

function bookPick(
  book: LibraryBook,
  native: string,
  level: CefrLevel | null,
  language: string,
): Pick {
  const title = translationFor(book.titles, native) || book.title;
  return {
    key: `book-${book.slug}`,
    title,
    original: title !== book.title ? book.title : null,
    blurb: translationFor(book.blurbs, native) ?? null,
    level: book.level,
    words: book.wordCount,
    source: book.author,
    interest: null,
    harder: levelGap(book.level, level) >= 2,
    articleId: null,
    bookTitle: book.title,
    bookAuthor: book.author,
    add: () => addLibraryBook(language, book.slug),
  };
}

function articlePick(
  article: ReadingFeedArticle,
  interest: FeedInterest,
  level: CefrLevel | null,
): Pick {
  return {
    key: `article-${article.id}`,
    title: article.title,
    original: null,
    blurb: null,
    level: article.level,
    words: article.wordCount,
    source: article.source,
    interest,
    harder: levelGap(article.level, level) >= 2,
    articleId: article.id,
    bookTitle: null,
    bookAuthor: null,
    add: () => addReadingFeedArticle(article.id),
  };
}

export default function RecommendedForYou({
  language,
  level,
  interests,
  nativeLanguage,
  onStart,
  actionLabel,
  className = '',
  onEmpty,
  compact = false,
}: {
  language: string;
  level: CefrLevel | null;
  interests: readonly string[];
  nativeLanguage?: string;
  /** Called with the collection id once the item is in the library. */
  onStart: (collectionId: string) => Promise<void> | void;
  actionLabel?: string;
  className?: string;
  /** Called once books and articles have both loaded with nothing to suggest. */
  onEmpty?: () => void;
  compact?: boolean;
}) {
  const t = useTranslations('recommend');
  const format = useFormatter();
  const locale = useLocale();
  const [books, setBooks] = useState<Pick[] | null>(null);
  const [articles, setArticles] = useState<Pick[] | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [native, setNative] = useState<string>(() => nativeLanguageFromLocale(locale));
  const startingRef = useRef(false);
  const [showDescriptions] = useShowDescriptions();
  const interestKey = interests.join(',');

  useEffect(() => {
    let cancelled = false;
    const wanted = FEED_INTERESTS.filter((id) => interestKey.split(',').includes(id));
    const pickBooks = (catalog: LibraryBook[], ownLanguage: string) => {
      const shown = displayLanguage(ownLanguage, locale);
      const target = recommendationLevel(language, ownLanguage, level);
      return pickNearLevel(
        catalog.filter((book) => !book.added),
        target,
        3,
      ).map((book) => bookPick(book, shown, target, language));
    };
    const pickArticles = (
      lists: { id: FeedInterest; list: ReadingFeedArticle[] }[],
      ownLanguage: string,
    ) => {
      const target = recommendationLevel(language, ownLanguage, level);
      return lists.flatMap(({ id, list }) =>
        pickNearLevel(list, target, 1).map((article) => articlePick(article, id, target)),
      );
    };

    const rememberedNative =
      nativeLanguage ??
      (peekSettingCached<string>('nativeLanguage') || nativeLanguageFromLocale(locale));
    const stored = cachedCatalog(language);
    const rememberedLists = wanted.map((id) => ({ id, list: peekReadingFeed(language, id) }));
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- start from what the device remembers */
    setNative(displayLanguage(rememberedNative, locale));
    setBooks(stored ? pickBooks(stored, rememberedNative) : null);
    setArticles(
      rememberedLists.every((entry) => entry.list)
        ? pickArticles(
            rememberedLists as { id: FeedInterest; list: ReadingFeedArticle[] }[],
            rememberedNative,
          )
        : null,
    );

    (async () => {
      const saved =
        nativeLanguage ?? (await getSettingCached<string>('nativeLanguage').catch(() => undefined));
      const ownLanguage = saved || nativeLanguageFromLocale(locale);
      if (cancelled) return;
      setNative(displayLanguage(ownLanguage, locale));

      const catalog = await loadCatalog(language).catch(() => [] as LibraryBook[]);
      if (!cancelled) setBooks(pickBooks(catalog, ownLanguage));

      const lists = await Promise.all(
        wanted.map((id) =>
          getReadingFeedCached(language, id)
            .then((list) => ({ id, list }))
            .catch(() => ({ id, list: [] as ReadingFeedArticle[] })),
        ),
      );
      if (!cancelled) setArticles(pickArticles(lists, ownLanguage));
    })();

    return () => {
      cancelled = true;
    };
  }, [language, level, interestKey, locale, nativeLanguage]);

  const empty = books?.length === 0 && articles?.length === 0;
  useEffect(() => {
    if (empty) onEmpty?.();
  }, [empty, onEmpty]);

  const described = useArticleDescriptions(
    (articles ?? []).flatMap((pick) => (pick.articleId ? [pick.articleId] : [])),
    native,
    language,
  );

  async function start(pick: Pick) {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(pick.key);
    try {
      const collectionId = await pick.add();
      await onStart(collectionId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errStart'));
      startingRef.current = false;
      setStarting(null);
    }
  }

  function card(pick: Pick) {
    const description = pick.articleId ? described[pick.articleId] : undefined;
    const title = description?.title ?? pick.title;
    const original = description ? pick.title : pick.original;
    const blurb = description?.summary ?? pick.blurb;
    const label = starting === pick.key ? t('starting') : (actionLabel ?? t('start'));
    if (compact) {
      return (
        <li key={pick.key} data-testid={`recommend-${pick.key}`}>
          <Button
            variant="ghost"
            onClick={() => void start(pick)}
            disabled={starting !== null}
            className="h-auto min-h-14 w-full justify-start gap-3 px-2 py-2 text-left whitespace-normal"
            data-testid={`recommend-start-${pick.key}`}
          >
            <span className="min-w-0 flex-1">
              <span className="block font-semibold break-words text-foreground">{title}</span>
              {pick.source && (
                <span className="block text-xs break-words text-muted-foreground">
                  {pick.source}
                </span>
              )}
            </span>
            {pick.level && (
              <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {pick.level}
              </span>
            )}
            {starting === pick.key ? (
              <Spinner label={label} />
            ) : (
              <>
                <span className="sr-only">{label}</span>
                <ChevronRight aria-hidden="true" className="text-muted-foreground" />
              </>
            )}
          </Button>
        </li>
      );
    }
    return (
      <li
        key={pick.key}
        onClick={() => void start(pick)}
        className="flex cursor-pointer flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary sm:flex-row sm:items-start sm:justify-between"
        data-testid={`recommend-${pick.key}`}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-foreground">{title}</h4>
            <LevelTags language={language} level={pick.level} native={native} />
            {pick.interest && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {t(`interest.${pick.interest}`)}
              </span>
            )}
          </div>
          {original && (
            <p className="text-xs text-muted-foreground">{t('original', { title: original })}</p>
          )}
          {showDescriptions && blurb && <p className="mt-1 text-sm text-foreground">{blurb}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            {t('words', { words: format.number(pick.words) })}
            {pick.source ? ` · ${pick.source}` : ''}
            {pick.harder ? ` · ${t('harder')}` : ''}
            {pick.bookTitle && pick.bookAuthor && (
              <>
                {' · '}
                <BookReviewLink
                  native={native}
                  title={pick.bookTitle}
                  author={pick.bookAuthor}
                  nativeTitle={title}
                />
              </>
            )}
          </p>
        </div>
        <Button
          size="sm"
          disabled={starting !== null}
          className="shrink-0 self-start"
          data-testid={`recommend-start-${pick.key}`}
        >
          {label}
        </Button>
      </li>
    );
  }

  if (books === null) {
    return (
      <div className={`flex justify-center py-8 ${className}`}>
        <Spinner size="lg" label={t('loading')} className="text-primary" />
      </div>
    );
  }

  const loadingArticles = articles === null;

  return (
    <div
      className={`${compact ? 'space-y-3' : 'space-y-6'} ${className}`}
      data-testid="recommend-list"
    >
      {books.length > 0 && (
        <section>
          <h3 className={compact ? 'sr-only' : 'mb-2 text-sm font-bold text-foreground'}>
            {t('booksTitle')}
          </h3>
          <ul className={compact ? 'divide-y divide-border border-t border-border' : 'space-y-3'}>
            {books.map(card)}
          </ul>
        </section>
      )}
      {loadingArticles && interests.length > 0 && (
        <div className="flex justify-center py-2">
          <Spinner label={t('loading')} className="text-primary" />
        </div>
      )}
      {articles && articles.length > 0 && (
        <section>
          <h3
            className={
              compact
                ? 'px-2 text-xs font-medium text-muted-foreground'
                : 'mb-2 text-sm font-bold text-foreground'
            }
          >
            {t('articlesTitle')}
          </h3>
          <ul className={compact ? 'divide-y divide-border' : 'space-y-3'}>{articles.map(card)}</ul>
        </section>
      )}
      {books.length === 0 && articles && articles.length === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="recommend-empty">
          {t('empty')}
        </p>
      )}
    </div>
  );
}
