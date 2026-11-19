'use client';

import { ArrowDownUp, ChevronRight, SlidersHorizontal, X } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { buttonVariants, Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useIsNativeApp } from '@/lib/native-app';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  addLibraryBook,
  addReadingFeedArticle,
  getReadingFeed,
  getSetting,
  type LibraryBook,
  type ReadingFeedArticle,
} from '@/lib/data-layer';
import { cachedCatalog, loadCatalog } from '@/lib/catalog-cache';
import BookReviewLink from '@/components/BookReviewLink';
import DescriptionToggle from '@/components/DescriptionToggle';
import { useShowDescriptions } from '@/lib/show-descriptions';
import LevelTags from '@/components/LevelTags';
import { useArticleDescriptions } from '@/lib/article-descriptions';
import { languageDisplayName } from '@/lib/language-names';
import { displayLanguage, translationFor } from '@/lib/display-language';
import { nativeLanguageFromLocale } from '@/lib/languages';
import { trackProductEvent } from '@/lib/product-analytics';
import {
  CEFR_LEVELS,
  examLabels,
  getReadingLevel,
  setReadingLevel,
  type CefrLevel,
} from '@/lib/reading-level';
import { useActiveLanguage } from '@/utils/hooks';
import { readingMinutes } from '@/lib/reading-time';
import {
  LIBRARY_CATEGORIES,
  categoryCounts,
  levelsWithBooks,
  matchesFilters,
  type LibraryCategory,
} from '@/lib/library-filter';

// Only 'en' and 'fr' have a working reading-feed source today (see
// api/src/lib/reading-feed/sources/index.ts); every other target language
// shows only the Books tab.
const FEED_INTERESTS = ['news', 'travel', 'science'] as const;
type FeedInterest = (typeof FEED_INTERESTS)[number];
const FEED_LANGUAGES = new Set(['en', 'fr']);

type TabId = 'books' | FeedInterest;
type BookSort = 'default' | 'short' | 'long';
const FILTERS_OPEN_KEY = 'readfox-free-books-filters-open';

function sumCounts(counts: Record<LibraryCategory, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

export default function FreeBooksModal({
  isOpen,
  onClose,
  onAdded,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const t = useTranslations('library.freeBooks');
  const tl = useTranslations('readingLevel');
  const format = useFormatter();
  const locale = useLocale();
  const activeLang = useActiveLanguage();
  const [books, setBooks] = useState<LibraryBook[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [native, setNative] = useState<string>(locale);
  const [yourLevel, setYourLevel] = useState<CefrLevel | null>(null);
  const [filter, setFilter] = useState<CefrLevel | 'all'>('all');
  const [readingInterests, setReadingInterests] = useState<string[]>([]);
  const [tab, setTab] = useState<TabId>('books');
  const [query, setQuery] = useState('');
  const inApp = useIsNativeApp();
  const [sort, setSort] = useState<BookSort>('default');
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    try {
      setFiltersOpen(localStorage.getItem(FILTERS_OPEN_KEY) === '1');
    } catch {
      // storage unavailable: keep the filters folded
    }
  }, []);

  function toggleFilters() {
    setFiltersOpen((open) => {
      try {
        localStorage.setItem(FILTERS_OPEN_KEY, open ? '0' : '1');
      } catch {
        // storage unavailable: the choice lasts until the dialog closes
      }
      return !open;
    });
  }
  const [category, setCategory] = useState<LibraryCategory | 'all'>('all');
  const [feed, setFeed] = useState<ReadingFeedArticle[] | null>(null);
  const [feedFailed, setFeedFailed] = useState(false);
  const languageName = languageDisplayName(activeLang.code, locale, activeLang.name);
  const [showDescriptions] = useShowDescriptions();
  const described = useArticleDescriptions(
    (feed ?? []).map((article) => article.id),
    native,
    activeLang.code,
  );
  const titleFor = (book: LibraryBook) => translationFor(book.titles, native) || book.title;

  const feedAvailable = FEED_LANGUAGES.has(activeLang.code);
  const availableFeedInterests = feedAvailable ? FEED_INTERESTS : [];
  const chosenFeedInterests = readingInterests.filter((id): id is FeedInterest =>
    (availableFeedInterests as readonly string[]).includes(id),
  );
  const otherFeedInterests = availableFeedInterests.filter(
    (id) => !chosenFeedInterests.includes(id),
  );
  const tabOrder: TabId[] = [...chosenFeedInterests, 'books', ...otherFeedInterests];

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setBooks(cachedCatalog(activeLang.code));
    setFailed(false);
    loadCatalog(activeLang.code)
      .then((list) => !cancelled && setBooks(list))
      .catch(() => !cancelled && setFailed(true));
    getSetting<string>('nativeLanguage')
      .catch(() => undefined)
      .then((code) => {
        if (!cancelled) {
          setNative(displayLanguage(code || nativeLanguageFromLocale(navigator.language), locale));
        }
      });
    getReadingLevel(activeLang.code).then((level) => {
      if (cancelled) return;
      setYourLevel(level);
      setFilter(level ?? 'all');
    });
    getSetting<string[]>('readingInterests')
      .catch(() => undefined)
      .then((list) => {
        if (cancelled) return;
        const interests = Array.isArray(list) ? list : [];
        setReadingInterests(interests);
        const firstAvailable = interests.find((id) =>
          (FEED_INTERESTS as readonly string[]).includes(id),
        );
        setTab(
          FEED_LANGUAGES.has(activeLang.code) && firstAvailable
            ? (firstAvailable as TabId)
            : 'books',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeLang.code, locale]);

  useEffect(() => {
    if (!isOpen || tab === 'books') return;
    let cancelled = false;
    setFeed(null);
    setFeedFailed(false);
    getReadingFeed(activeLang.code, tab)
      .then((list) => !cancelled && setFeed(list))
      .catch(() => !cancelled && setFeedFailed(true));
    return () => {
      cancelled = true;
    };
  }, [isOpen, tab, activeLang.code]);

  async function add(book: LibraryBook) {
    setAdding(book.slug);
    try {
      await addLibraryBook(activeLang.code, book.slug);
      trackProductEvent({
        event: 'content_selected',
        language: activeLang.code,
        feature: 'library',
        publicBook: `${activeLang.code}/${book.slug}`,
      });
      setBooks(
        (list) => list?.map((b) => (b.slug === book.slug ? { ...b, added: true } : b)) ?? null,
      );
      toast.success(t('added', { title: titleFor(book) }));
      onAdded();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errAdd'));
    } finally {
      setAdding(null);
    }
  }

  async function addArticle(article: ReadingFeedArticle) {
    setAdding(article.id);
    try {
      await addReadingFeedArticle(article.id);
      trackProductEvent({ event: 'content_selected', language: activeLang.code, feature: 'feed' });
      toast.success(t('feedAdded', { title: article.title }));
      onAdded();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('feedErrAdd'));
    } finally {
      setAdding(null);
    }
  }

  function pickLevel(level: CefrLevel | 'all') {
    setFilter(level);
    if (level === 'all' || level === yourLevel) return;
    setYourLevel(level);
    setReadingLevel(activeLang.code, level).catch(() => {});
  }

  const allBooks = books ?? [];
  const searching = query.trim() !== '';
  const levels = CEFR_LEVELS.filter((level) => allBooks.some((book) => book.level === level));
  const levelFilter = filter !== 'all' && levels.includes(filter) ? filter : 'all';
  const counts = categoryCounts(allBooks, { query, level: searching ? 'all' : levelFilter });
  const presentCategories = LIBRARY_CATEGORIES.filter((c) =>
    allBooks.some((book) => book.category === c),
  );
  const activeCategory = category !== 'all' && counts[category] > 0 ? category : 'all';
  const levelsInCategory = levelsWithBooks(allBooks, activeCategory);
  const current = levelFilter !== 'all' && levelsInCategory.has(levelFilter) ? levelFilter : 'all';
  const activeFilters =
    (!searching && current !== 'all' ? 1 : 0) + (activeCategory !== 'all' ? 1 : 0);
  const matching = allBooks.filter((book) =>
    matchesFilters(book, { query, level: searching ? 'all' : current, category: activeCategory }),
  );
  const sorted =
    sort === 'default'
      ? matching
      : [...matching].sort((a, b) =>
          sort === 'short' ? a.wordCount - b.wordCount : b.wordCount - a.wordCount,
        );
  const shownLevels = levels.filter((level) => sorted.some((book) => book.level === level));
  const timeLabel = (book: LibraryBook) => {
    const minutes = readingMinutes(book.wordCount, activeLang.code);
    return minutes >= 60
      ? t('readingHours', { hours: Math.round(minutes / 60) })
      : t('readingMinutes', { minutes });
  };

  const examLine = (level: CefrLevel) =>
    examLabels(activeLang.code, level, native, locale, (exam, score) =>
      tl(`exam.${exam}`, { score }),
    ).join(' · ');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={`flex max-w-2xl flex-col overflow-hidden ${inApp ? 'max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1.5rem)]' : 'max-h-[85vh]'}`}
      >
        <div
          className={
            inApp
              ? 'flex items-center justify-between border-b border-border px-3'
              : 'flex items-center justify-between border-b border-border px-6 py-4'
          }
        >
          <DialogTitle className={inApp ? 'text-base' : undefined}>{t('title')}</DialogTitle>
          <DialogClose
            className={buttonVariants({
              variant: 'ghost',
              size: 'icon',
              className: inApp && 'size-11',
            })}
            aria-label={t('close')}
          >
            <X className="h-5 w-5" />
          </DialogClose>
        </div>
        {tabOrder.length > 1 && (
          <div
            className={`flex gap-1 border-b border-border ${inApp ? 'px-3' : 'px-6 pt-3'}`}
            data-testid="free-books-tabs"
          >
            {tabOrder.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
                data-testid={`free-books-tab-${id}`}
                className={`rounded-t-lg px-3 py-2 text-sm font-medium transition-colors ${inApp ? 'min-h-11' : ''} ${
                  tab === id
                    ? 'border-b-2 border-primary text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t(`tab.${id}`)}
              </button>
            ))}
          </div>
        )}
        {tab === 'books' ? (
          <div
            className={`min-h-0 overflow-y-auto ${inApp ? 'px-3 py-2' : 'px-6 py-4'}`}
            data-testid="free-books-list"
          >
            {!inApp && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {t('intro', { language: languageName })}
                </p>
                <DescriptionToggle />
              </div>
            )}
            {failed && <p className="text-sm text-destructive">{t('errLoad')}</p>}
            {!failed && books === null && (
              <p className="text-sm text-muted-foreground">{t('loading')}</p>
            )}
            {books?.length === 0 && (
              <p className="text-sm text-muted-foreground" data-testid="free-books-empty">
                {t('none', { language: languageName })}
              </p>
            )}
            {(books?.length ?? 0) > 0 && (
              <div className={`mb-3 flex gap-2 ${inApp ? 'items-stretch' : ''}`}>
                <Input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('search')}
                  aria-label={t('search')}
                  className={`min-w-0 flex-1 ${inApp ? 'min-h-11' : ''}`}
                  data-testid="free-books-search"
                />
                {inApp ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="outline" size="icon-lg" />}
                      aria-label={t('sortLabel')}
                      data-testid="free-books-sort-menu"
                    >
                      <ArrowDownUp aria-hidden />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-max min-w-36">
                      <DropdownMenuRadioGroup
                        value={sort}
                        onValueChange={(value) => setSort(value as BookSort)}
                      >
                        <DropdownMenuRadioItem className="min-h-11" value="default">
                          {t('sortDefault')}
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem className="min-h-11" value="short">
                          {t('sortShort')}
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem className="min-h-11" value="long">
                          {t('sortLong')}
                        </DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Select
                    value={sort}
                    onChange={(event) => setSort(event.target.value as BookSort)}
                    aria-label={t('sortLabel')}
                    wrapperClassName="w-32 shrink-0 sm:w-40"
                    data-testid="free-books-sort"
                  >
                    <option value="default">{t('sortDefault')}</option>
                    <option value="short">{t('sortShort')}</option>
                    <option value="long">{t('sortLong')}</option>
                  </Select>
                )}
                <Button
                  type="button"
                  variant={filtersOpen ? 'secondary' : 'outline'}
                  onClick={toggleFilters}
                  aria-expanded={filtersOpen}
                  className={inApp ? 'min-w-11 px-2' : undefined}
                  data-testid="free-books-filters-toggle"
                >
                  <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                  <span className={inApp ? 'sr-only' : undefined}>{t('filters')}</span>
                  {activeFilters > 0 && (
                    <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                      {activeFilters}
                    </span>
                  )}
                </Button>
              </div>
            )}
            {shownLevels.length === 0 && allBooks.length > 0 && (
              <p className="text-sm text-muted-foreground" data-testid="free-books-no-match">
                {searching ? t('noMatch', { query: query.trim() }) : t('noMatchFilters')}
              </p>
            )}
            {filtersOpen && levels.length > 0 && !searching && (
              <div className="mb-3 flex flex-wrap gap-2" data-testid="free-books-levels">
                {(['all', ...levels] as const).map((level) => (
                  <button
                    key={level}
                    type="button"
                    aria-pressed={current === level}
                    disabled={level !== 'all' && !levelsInCategory.has(level)}
                    onClick={() => pickLevel(level)}
                    data-testid={`free-books-level-${level}`}
                    className={`shrink-0 rounded-xl border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40 ${
                      current === level
                        ? 'border-primary bg-[var(--primary-soft)] text-[var(--primary-text)]'
                        : 'border-border bg-background text-foreground hover:bg-accent'
                    }`}
                  >
                    {level === 'all' ? tl('all') : `${level} · ${tl(`names.${level}`)}`}
                    {level === yourLevel && (
                      <span className="ml-1 text-xs text-muted-foreground">({tl('yours')})</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {filtersOpen && presentCategories.length > 1 && (
              <div
                className="mb-4 flex flex-wrap gap-2"
                role="group"
                aria-label={t('categoryFilter')}
                data-testid="free-books-categories"
              >
                {(['all', ...presentCategories] as const).map((id) => {
                  const total = id === 'all' ? sumCounts(counts) : counts[id];
                  const selected = activeCategory === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={selected}
                      disabled={id !== 'all' && total === 0}
                      onClick={() => setCategory(id)}
                      data-testid={`free-books-category-${id}`}
                      className={`rounded-full border px-3 py-1 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40 ${
                        selected
                          ? 'border-primary bg-[var(--primary-soft)] text-[var(--primary-text)]'
                          : 'border-border bg-background text-foreground hover:bg-accent'
                      }`}
                    >
                      {id === 'all' ? t('categoryAll') : t(`categories.${id}`)}
                      <span className="ml-1 text-xs text-muted-foreground">{total}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {shownLevels.map((level) => {
              const exams = examLine(level);
              return (
                <section key={level} className="mb-5" data-testid={`free-books-group-${level}`}>
                  <h3 className="text-sm font-bold text-foreground">
                    {level} · {tl(`names.${level}`)}
                  </h3>
                  {!inApp && exams && (
                    <p className="mb-2 text-xs text-muted-foreground" title={tl('approx')}>
                      {exams}
                    </p>
                  )}
                  <ul className={inApp ? 'divide-y divide-border' : 'space-y-3'}>
                    {sorted
                      .filter((book) => book.level === level)
                      .map((book) => {
                        const shownTitle = titleFor(book);
                        const blurb = translationFor(book.blurbs, native);
                        const details = (
                          <>
                            {shownTitle !== book.title && (
                              <p className="text-xs text-muted-foreground">
                                {tl('original', { title: book.title })}
                              </p>
                            )}
                            <p className="text-sm text-muted-foreground">
                              {book.author}
                              {book.category && ` · ${t(`categories.${book.category}`)}`}
                            </p>
                            {(inApp || showDescriptions) && blurb && (
                              <p className="mt-1 text-sm text-foreground">{blurb}</p>
                            )}
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t('size', {
                                words: format.number(book.wordCount),
                                lessons: format.number(book.lessonCount),
                              })}
                              {' · '}
                              {timeLabel(book)}
                              {' · '}
                              <BookReviewLink
                                native={native}
                                title={book.title}
                                author={book.author}
                                nativeTitle={shownTitle}
                              />
                              {' · '}
                              <a
                                href={book.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline"
                              >
                                {book.sourceName}
                              </a>
                            </p>
                          </>
                        );
                        return (
                          <li
                            key={book.slug}
                            className={
                              inApp
                                ? 'flex items-start gap-2 py-2'
                                : 'flex flex-wrap items-start gap-x-4 gap-y-3 rounded-xl border border-border bg-card p-4 sm:flex-nowrap'
                            }
                            data-testid={`free-book-${book.slug}`}
                          >
                            {book.cover && (
                              <Image
                                width={56}
                                height={75}
                                sizes={inApp ? '36px' : '56px'}
                                src={book.cover.url}
                                alt=""
                                loading="lazy"
                                data-testid="free-book-cover"
                                className={`aspect-[3/4] shrink-0 rounded-md bg-muted object-cover ${inApp ? 'w-9' : 'w-12 sm:w-14'}`}
                              />
                            )}
                            <div
                              className={
                                inApp
                                  ? 'min-w-0 flex-1'
                                  : 'min-w-0 flex-1 basis-[calc(100%-4.75rem)] sm:basis-0'
                              }
                            >
                              {inApp ? (
                                <details className="group">
                                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden">
                                    <span className="min-w-0 flex-1">
                                      <span className="block text-sm leading-snug font-semibold">
                                        {shownTitle}
                                      </span>
                                      <span className="block truncate text-xs text-muted-foreground">
                                        {book.author}
                                      </span>
                                    </span>
                                    <ChevronRight
                                      className="size-3 shrink-0 text-muted-foreground group-open:rotate-90"
                                      aria-hidden
                                    />
                                  </summary>
                                  <div className="space-y-1 pb-2">{details}</div>
                                </details>
                              ) : (
                                <>
                                  <h4 className="font-semibold text-foreground">{shownTitle}</h4>
                                  {details}
                                </>
                              )}
                            </div>
                            <Button
                              size={inApp ? 'default' : 'sm'}
                              className={inApp ? 'min-w-11 px-2 text-xs' : 'ml-16 sm:ml-0'}
                              variant={book.added ? 'outline' : 'default'}
                              disabled={book.added || adding !== null}
                              onClick={() => add(book)}
                              data-testid={`free-book-add-${book.slug}`}
                            >
                              {book.added
                                ? t('addedLabel')
                                : adding === book.slug
                                  ? t('adding')
                                  : t('add')}
                            </Button>
                          </li>
                        );
                      })}
                  </ul>
                </section>
              );
            })}
            {!inApp && levels.length > 0 && (
              <p className="text-xs text-muted-foreground">{tl('approx')}</p>
            )}
          </div>
        ) : (
          <div
            className={`min-h-0 overflow-y-auto ${inApp ? 'px-3 py-2' : 'px-6 py-4'}`}
            data-testid="reading-feed-list"
          >
            {!inApp && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {t('feedIntro', { interest: t(`tab.${tab}`), language: languageName })}
                </p>
                <DescriptionToggle />
              </div>
            )}
            {feedFailed && <p className="text-sm text-destructive">{t('feedErrLoad')}</p>}
            {!feedFailed && feed === null && (
              <p className="text-sm text-muted-foreground">{t('feedLoading')}</p>
            )}
            {feed?.length === 0 && (
              <p className="text-sm text-muted-foreground" data-testid="reading-feed-empty">
                {t('feedNone')}
              </p>
            )}
            <ul className="space-y-3">
              {feed?.map((article) => (
                <li
                  key={article.id}
                  className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4"
                  data-testid={`reading-feed-article-${article.id}`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold text-foreground">
                        {described[article.id]?.title ?? article.title}
                      </h4>
                      <LevelTags language={activeLang.code} level={article.level} native={native} />
                    </div>
                    {described[article.id] && (
                      <>
                        <p className="text-xs text-muted-foreground">
                          {tl('original', { title: article.title })}
                        </p>
                        {showDescriptions && (
                          <p className="mt-1 text-sm text-foreground">
                            {described[article.id].summary}
                          </p>
                        )}
                      </>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('feedSize', { words: format.number(article.wordCount) })}
                      {' · '}
                      {new Date(article.publishedAt).toLocaleDateString(locale)}
                      {' · '}
                      <a
                        href={article.licenseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        {t('feedSource', { source: article.source, license: article.license })}
                      </a>
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={adding !== null}
                    onClick={() => addArticle(article)}
                    data-testid={`reading-feed-add-${article.id}`}
                  >
                    {adding === article.id ? t('feedAdding') : t('feedAdd')}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
