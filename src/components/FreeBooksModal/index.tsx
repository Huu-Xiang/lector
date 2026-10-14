'use client';

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { buttonVariants, Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { addLibraryBook, getLibraryCatalog, type LibraryBook } from '@/lib/data-layer';
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
  const format = useFormatter();
  const activeLang = useActiveLanguage();
  const [books, setBooks] = useState<LibraryBook[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- load the catalog each time the dialog opens */
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setBooks(null);
    setFailed(false);
    getLibraryCatalog(activeLang.code)
      .then((list) => !cancelled && setBooks(list))
      .catch(() => !cancelled && setFailed(true));
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
          <ul className="space-y-3">
            {books?.map((book) => (
              <li
                key={book.slug}
                className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4"
                data-testid={`free-book-${book.slug}`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-foreground">{book.title}</h3>
                    <span
                      className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-xs font-medium text-[var(--primary-text)]"
                      title={t('levelHint')}
                    >
                      {book.level}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{book.author}</p>
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
                  {book.added ? t('addedLabel') : adding === book.slug ? t('adding') : t('add')}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
