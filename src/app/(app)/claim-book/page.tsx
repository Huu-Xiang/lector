'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { claimBookFromSearch } from '@/lib/auth-return';
import {
  addLibraryBook,
  getLessonsForCollection,
  getLibraryCatalog,
  setSetting,
  type LibraryBook,
} from '@/lib/data-layer';
import { readLanguageCache } from '@/lib/language-cache';
import { setLanguageInStorage } from '@/utils/storage';

function ClaimBookInner() {
  const t = useTranslations('publicBooks');
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const claim = useMemo(() => claimBookFromSearch(search), [search]);

  const [book, setBook] = useState<LibraryBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function openClaimedBook(
    target: { book: string; lang: string },
    switchLanguage: boolean,
  ): Promise<void> {
    const collectionId = await addLibraryBook(target.lang, target.book);
    if (switchLanguage) {
      await setSetting('targetLanguage', target.lang);
      setLanguageInStorage(target.lang);
    }
    const lessons = await getLessonsForCollection(collectionId);
    router.replace(lessons[0] ? `/read/${lessons[0].id}` : `/collection/${collectionId}`);
  }

  useEffect(() => {
    if (!claim) {
      router.replace('/');
      return;
    }

    let cancelled = false;

    async function inspectCatalog() {
      if (!claim) return;
      try {
        const catalog = await getLibraryCatalog(claim.lang);
        if (cancelled) return;
        const match = catalog.find((item) => item.slug === claim.book);
        if (!match) {
          router.replace('/');
          return;
        }
        // Only auto-open without confirmation when already in the book's language and library.
        if (match.added && readLanguageCache() === claim.lang) {
          const collectionId = await addLibraryBook(claim.lang, claim.book);
          const lessons = await getLessonsForCollection(collectionId);
          if (cancelled) return;
          router.replace(lessons[0] ? `/read/${lessons[0].id}` : `/collection/${collectionId}`);
          return;
        }
        setBook(match);
      } catch {
        if (!cancelled) router.replace('/');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void inspectCatalog();
    return () => {
      cancelled = true;
    };
  }, [claim, router]);

  async function handleConfirmAdd() {
    if (!claim || submitting) return;
    setSubmitting(true);
    try {
      await openClaimedBook(claim, true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('claimBack'));
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <Spinner size="lg" label={t('claimAdding')} className="text-primary" />
      </main>
    );
  }

  if (!book || !claim) return null;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-foreground">{t('claimTitle')}</h1>
        <p className="mt-2 font-serif text-lg font-semibold text-foreground">{book.title}</p>
        {book.author && <p className="text-sm text-muted-foreground">{book.author}</p>}
        <p className="mt-3 text-sm text-muted-foreground">{t('claimBody')}</p>
        <div className="mt-6 flex flex-col gap-2.5">
          <Button
            type="button"
            disabled={submitting}
            onClick={() => void handleConfirmAdd()}
            data-testid="claim-book-confirm"
          >
            {submitting ? t('claimAdding') : t('claimConfirm')}
          </Button>
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-foreground hover:bg-accent"
          >
            {t('claimBack')}
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function ClaimBookPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center bg-background">
          <Spinner size="lg" className="text-primary" />
        </main>
      }
    >
      <ClaimBookInner />
    </Suspense>
  );
}
