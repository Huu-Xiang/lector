'use client';

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { buttonVariants, Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { addLibraryBook, getLibraryCatalog, getSetting, type LibraryBook } from '@/lib/data-layer';
import { nativeLanguageFromLocale } from '@/lib/languages';
import {
  CEFR_LEVELS,
  examRefs,
  getReadingLevel,
  setReadingLevel,
  showMainlandExams,
  type CefrLevel,
} from '@/lib/reading-level';
import { useActiveLanguage } from '@/utils/hooks';

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
  const mainland = showMainlandExams(locale);

  /* eslint-disable react-hooks/set-state-in-effect -- load the catalog each time the dialog opens */
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setBooks(null);
    setFailed(false);
    getLibraryCatalog(activeLang.code)
      .then((list) => !cancelled && setBooks(list))
      .catch(() => !cancelled && setFailed(true));
    getSetting<string>('nativeLanguage')
      .catch(() => undefined)
      .then((code) => {
        if (!cancelled) setNative(code || nativeLanguageFromLocale(navigator.language));
      });
    getReadingLevel(activeLang.code).then((level) => {
      if (cancelled) return;
      setYourLevel(level);
      setFilter(level ?? 'all');
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeLang.code]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function add(book: LibraryBook) {
    setAdding(book.slug);
    try {
      await addLibraryBook(activeLang.code, book.slug);
      setBooks(
        (list) => list?.map((b) => (b.slug === book.slug ? { ...b, added: true } : b)) ?? null,
      );
      toast.success(t('added', { title: book.title }));
      onAdded();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errAdd'));
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

  const levels = CEFR_LEVELS.filter((level) => books?.some((book) => book.level === level));
  const current = filter !== 'all' && levels.includes(filter) ? filter : 'all';
  const shownLevels = current === 'all' ? levels : levels.filter((level) => level === current);

  const examLine = (level: CefrLevel) =>
    examRefs(activeLang.code, level, mainland)
      .map((ref) => tl(`exam.${ref.exam}`, { score: ref.score ?? '' }))
      .join(' · ');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogClose
            className={buttonVariants({ variant: 'ghost', size: 'icon' })}
            aria-label={t('close')}
          >
            <X className="h-5 w-5" />
          </DialogClose>
        </div>
        <div className="overflow-y-auto px-6 py-4" data-testid="free-books-list">
          <p className="mb-4 text-sm text-muted-foreground">
            {t('intro', { language: activeLang.native })}
          </p>
          {failed && <p className="text-sm text-destructive">{t('errLoad')}</p>}
          {!failed && books === null && (
            <p className="text-sm text-muted-foreground">{t('loading')}</p>
          )}
          {books?.length === 0 && (
            <p className="text-sm text-muted-foreground" data-testid="free-books-empty">
              {t('none', { language: activeLang.native })}
            </p>
          )}
          {levels.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2" data-testid="free-books-levels">
              {(['all', ...levels] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  aria-pressed={current === level}
                  onClick={() => pickLevel(level)}
                  data-testid={`free-books-level-${level}`}
                  className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
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
          {shownLevels.map((level) => {
            const exams = examLine(level);
            return (
              <section key={level} className="mb-5" data-testid={`free-books-group-${level}`}>
                <h3 className="text-sm font-bold text-foreground">
                  {level} · {tl(`names.${level}`)}
                </h3>
                {exams && (
                  <p className="mb-2 text-xs text-muted-foreground" title={tl('approx')}>
                    {exams}
                  </p>
                )}
                <ul className="space-y-3">
                  {books
                    ?.filter((book) => book.level === level)
                    .map((book) => {
                      const shownTitle = book.titles[native] || book.title;
                      const blurb = book.blurbs[native];
                      return (
                        <li
                          key={book.slug}
                          className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4"
                          data-testid={`free-book-${book.slug}`}
                        >
                          <div className="min-w-0">
                            <h4 className="font-semibold text-foreground">{shownTitle}</h4>
                            {shownTitle !== book.title && (
                              <p className="text-xs text-muted-foreground">
                                {tl('original', { title: book.title })}
                              </p>
                            )}
                            <p className="text-sm text-muted-foreground">{book.author}</p>
                            {blurb && <p className="mt-1 text-sm text-foreground">{blurb}</p>}
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t('size', {
                                words: format.number(book.wordCount),
                                lessons: format.number(book.lessonCount),
                              })}
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
                          </div>
                          <Button
                            size="sm"
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
          {levels.length > 0 && <p className="text-xs text-muted-foreground">{tl('approx')}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
