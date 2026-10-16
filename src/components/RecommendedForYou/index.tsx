'use client';

import { useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  addLibraryBook,
  addReadingFeedArticle,
  getLibraryCatalog,
  getReadingFeed,
  getSetting,
  type LibraryBook,
  type ReadingFeedArticle,
} from '@/lib/data-layer';
import { nativeLanguageFromLocale } from '@/lib/languages';
import { levelGap, pickNearLevel } from '@/lib/recommend';
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
  add: () => Promise<string>;
}

function bookPick(
  book: LibraryBook,
  native: string,
  level: CefrLevel | null,
  language: string,
): Pick {
  const title = book.titles[native] || book.title;
  return {
    key: `book-${book.slug}`,
    title,
    original: title !== book.title ? book.title : null,
    blurb: book.blurbs[native] ?? null,
    level: book.level,
    words: book.wordCount,
    source: book.author,
    interest: null,
    harder: levelGap(book.level, level) >= 2,
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
    add: () => addReadingFeedArticle(article.id),
  };
}

export default function RecommendedForYou({
  language,
  level,
  interests,
  onStart,
  actionLabel,
  className = '',
}: {
  language: string;
  level: CefrLevel | null;
  interests: readonly string[];
  /** Called with the collection id once the item is in the library. */
  onStart: (collectionId: string) => Promise<void> | void;
  actionLabel?: string;
  className?: string;
}) {
  const t = useTranslations('recommend');
  const format = useFormatter();
  const locale = useLocale();
  const [books, setBooks] = useState<Pick[] | null>(null);
  const [articles, setArticles] = useState<Pick[] | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const interestKey = interests.join(',');

  useEffect(() => {
    let cancelled = false;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- reload for the new level or interests */
    setBooks(null);
    setArticles(null);

    (async () => {
      const native = await getSetting<string>('nativeLanguage')
        .catch(() => undefined)
        .then((code) => code || nativeLanguageFromLocale(locale));

      const catalog = await getLibraryCatalog(language).catch(() => [] as LibraryBook[]);
      const fresh = catalog.filter((book) => !book.added);
      const picked = pickNearLevel(fresh, level, 3).map((book) =>
        bookPick(book, native, level, language),
      );
      if (!cancelled) setBooks(picked);

      const wanted = FEED_INTERESTS.filter((id) => interestKey.split(',').includes(id));
      const lists = await Promise.all(
        wanted.map((id) =>
          getReadingFeed(language, id)
            .then((list) => ({ id, list }))
            .catch(() => ({ id, list: [] as ReadingFeedArticle[] })),
        ),
      );
      const best = lists.flatMap(({ id, list }) =>
        pickNearLevel(list, level, 1).map((article) => articlePick(article, id, level)),
      );
      if (!cancelled) setArticles(best);
    })();

    return () => {
      cancelled = true;
    };
  }, [language, level, interestKey, locale]);

  async function start(pick: Pick) {
    if (starting) return;
    setStarting(pick.key);
    try {
      const collectionId = await pick.add();
      await onStart(collectionId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errStart'));
      setStarting(null);
    }
  }

  function card(pick: Pick) {
    return (
      <li
        key={pick.key}
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between"
        data-testid={`recommend-${pick.key}`}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-foreground">{pick.title}</h4>
            <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-xs font-medium text-[var(--primary-text)]">
              {pick.level}
            </span>
            {pick.interest && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {t(`interest.${pick.interest}`)}
              </span>
            )}
          </div>
          {pick.original && (
            <p className="text-xs text-muted-foreground">
              {t('original', { title: pick.original })}
            </p>
          )}
          {pick.blurb && <p className="mt-1 text-sm text-foreground">{pick.blurb}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            {t('words', { words: format.number(pick.words) })}
            {pick.source ? ` · ${pick.source}` : ''}
            {pick.harder ? ` · ${t('harder')}` : ''}
          </p>
        </div>
        <Button
          size="sm"
          disabled={starting !== null}
          onClick={() => void start(pick)}
          className="shrink-0 self-start"
          data-testid={`recommend-start-${pick.key}`}
        >
          {starting === pick.key ? t('starting') : (actionLabel ?? t('start'))}
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
    <div className={`space-y-6 ${className}`} data-testid="recommend-list">
      {books.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-bold text-foreground">{t('booksTitle')}</h3>
          <ul className="space-y-3">{books.map(card)}</ul>
        </section>
      )}
      {loadingArticles && interests.length > 0 && (
        <div className="flex justify-center py-2">
          <Spinner label={t('loading')} className="text-primary" />
        </div>
      )}
      {articles && articles.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-bold text-foreground">{t('articlesTitle')}</h3>
          <ul className="space-y-3">{articles.map(card)}</ul>
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
