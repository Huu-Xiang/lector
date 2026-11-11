'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { buttonVariants, Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { registerHrefForBook } from '@/lib/pending-book';
import {
  missedWords,
  recommendBooks,
  sampleTest,
  scoreTest,
  seededRng,
  type TestItem,
  type VocabTestData,
} from '@/lib/vocab-test';
import { readVocabResult, writeVocabResult } from '@/lib/vocab-result';
import type { VocabTestBook } from '@/lib/vocab-test-data';

const PAGE_SIZE = 13;

function shownTitle(book: VocabTestBook, locale: string): string {
  return book.titles[locale] ?? book.titles.en ?? book.title;
}

function randomSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  } catch {
    return Math.floor(Math.random() * 2 ** 32);
  }
}

type Step = 'intro' | 'test' | 'result';

export default function VocabTest({
  data,
  books,
}: {
  data: VocabTestData;
  books: VocabTestBook[];
}) {
  const t = useTranslations('vocabTest');
  const locale = useLocale();
  const [step, setStep] = useState<Step>('intro');
  const [items, setItems] = useState<TestItem[]>([]);
  const [known, setKnown] = useState<ReadonlySet<string>>(new Set());
  const [page, setPage] = useState(0);
  const [lastResult, setLastResult] = useState<ReturnType<typeof readVocabResult>>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the saved result is in localStorage
    setLastResult(readVocabResult());
  }, []);

  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));

  useEffect(() => {
    if (step !== 'intro') headingRef.current?.focus();
  }, [step, page]);

  function begin() {
    setItems(sampleTest(data, seededRng(randomSeed())));
    setKnown(new Set());
    setPage(0);
    setStep('test');
    window.scrollTo({ top: 0 });
  }

  function toggle(id: string) {
    setKnown((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function go(next: number) {
    setPage(next);
    window.scrollTo({ top: 0 });
  }

  const score = useMemo(
    () => (step === 'result' ? scoreTest(items, known, data.bands) : null),
    [step, items, known, data.bands],
  );

  function finish() {
    const result = scoreTest(items, known, data.bands);
    if (!result.unreliable) writeVocabResult(result.estimate, result.level);
    setStep('result');
    window.scrollTo({ top: 0 });
  }

  if (step === 'intro') {
    return (
      <section className="space-y-5" data-testid="vocab-intro">
        <p className="text-base">{t('intro')}</p>
        {lastResult && (
          <p className="text-base font-medium" data-testid="vocab-last-result">
            {t('lastResult', { count: lastResult.estimate })}
          </p>
        )}
        <Button size="lg" onClick={begin} data-testid="vocab-start" className="min-h-11">
          {t('start')}
        </Button>
        {data.source && (
          <p className="text-xs text-muted-foreground">{t('credit', { source: data.source })}</p>
        )}
      </section>
    );
  }

  if (step === 'test') {
    const pageItems = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const last = page === pageCount - 1;
    return (
      <section className="space-y-4" data-testid="vocab-test">
        <div>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-sm font-semibold outline-none"
            data-testid="vocab-progress"
          >
            {t('progress', { page: page + 1, total: pageCount })}
          </h2>
          <div
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={pageCount}
            aria-valuenow={page + 1}
            aria-label={t('progress', { page: page + 1, total: pageCount })}
            className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${((page + 1) / pageCount) * 100}%` }}
            />
          </div>
          <p className="mt-2 text-muted-foreground">
            {t('tickHint')}{' '}
            <span data-testid="vocab-ticked">{t('ticked', { count: known.size })}</span>
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {pageItems.map((item) => {
            const on = known.has(item.id);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(item.id)}
                  data-testid="vocab-word"
                  className={cn(
                    'flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-base font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
                    on
                      ? 'border-primary bg-[var(--primary-soft)] text-[var(--primary-text)]'
                      : 'border-border bg-card text-foreground hover:bg-accent',
                  )}
                >
                  <span lang="en" className="min-w-0 break-words">
                    {item.word}
                  </span>
                  {on && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between gap-3 pt-2">
          <Button
            variant="outline"
            size="lg"
            className="min-h-11"
            disabled={page === 0}
            onClick={() => go(page - 1)}
            data-testid="vocab-back"
          >
            {t('back')}
          </Button>
          {last ? (
            <Button size="lg" className="min-h-11" onClick={finish} data-testid="vocab-finish">
              {t('finish')}
            </Button>
          ) : (
            <Button
              size="lg"
              className="min-h-11"
              onClick={() => go(page + 1)}
              data-testid="vocab-next"
            >
              {t('next')}
            </Button>
          )}
        </div>
      </section>
    );
  }

  if (!score) return null;
  const fromSetup = new URLSearchParams(window.location.search).get('from') === 'setup';
  const recommended = recommendBooks(books, score.estimate, score.level);
  const missed = missedWords(items, known, score.estimate, data.bands);
  const top = recommended[0];
  const topTitle = top ? shownTitle(top, locale) : '';

  return (
    <section className="space-y-6" data-testid="vocab-result">
      <div
        className={cn(
          'rounded-2xl border border-border bg-card p-5 text-center',
          score.unreliable && 'opacity-60',
        )}
      >
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-sm font-semibold text-muted-foreground outline-none"
        >
          {t('resultHeading')}
        </h2>
        <p className="mt-2 text-4xl font-bold tracking-tight" data-testid="vocab-estimate">
          {t('estimate', { count: score.estimate })}
        </p>
        <p className="mt-1 text-muted-foreground" data-testid="vocab-range">
          {t('range', { low: score.low, high: score.high })}
        </p>
        <p className="mt-3 text-xl font-semibold" data-testid="vocab-level">
          {t('level', { level: score.level })}
        </p>
        <p className="mt-3 text-muted-foreground">{t('explain')}</p>
      </div>

      {score.unreliable && (
        <div
          role="alert"
          data-testid="vocab-unreliable"
          className="rounded-xl border border-destructive/40 bg-destructive/10 p-4"
        >
          <p className="font-semibold">{t('unreliableTitle')}</p>
          <p className="mt-1">{t('unreliableBody')}</p>
          <Button className="mt-3 min-h-11" onClick={begin} data-testid="vocab-retake-warning">
            {t('retake')}
          </Button>
        </div>
      )}

      {missed.length > 0 && (
        <div data-testid="vocab-missed">
          <h3 className="text-lg font-semibold">{t('missedTitle')}</h3>
          <p className="text-muted-foreground">{t('missedHint')}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {missed.map((item) => (
              <li key={item.id} className="rounded-lg border border-border bg-card px-3 py-1.5">
                <span lang="en" className="font-medium">
                  {item.word}
                </span>
                {locale === 'zh-CN' && item.zh && (
                  <span lang="zh-CN" className="ml-2 text-muted-foreground">
                    {item.zh}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!score.unreliable && recommended.length > 0 && (
        <div data-testid="vocab-books">
          <h3 className="text-lg font-semibold">{t('booksTitle')}</h3>
          <p className="text-muted-foreground">{t('booksIntro')}</p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {recommended.map((book) => {
              const shown = shownTitle(book, locale);
              return (
                <li key={book.slug}>
                  <Link
                    href={`/books/en/${book.slug}`}
                    data-testid="vocab-book"
                    className="flex min-h-11 gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {book.cover && (
                      // eslint-disable-next-line @next/next/no-img-element -- covers are static files, as on the book page
                      <img
                        src={book.cover.url}
                        alt=""
                        width={48}
                        height={64}
                        loading="lazy"
                        className="aspect-[3/4] h-16 w-12 shrink-0 rounded border object-cover"
                      />
                    )}
                    <span className="min-w-0">
                      <span className="block font-semibold">{shown}</span>
                      <span className="block text-muted-foreground">{book.author}</span>
                      <span className="block text-xs text-muted-foreground">
                        {t('bookLevel', { level: book.level })}
                        {book.coverage !== null &&
                          ` · ${t('coverage', { percent: Math.round(book.coverage * 100) })}`}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        {fromSetup && !score.unreliable && (
          <Link
            href="/setup"
            onClick={() => writeVocabResult(score.estimate, score.level)}
            data-testid="vocab-continue-setup"
            className={cn(buttonVariants({ size: 'lg' }), 'min-h-11')}
          >
            {t('useLevel', { level: score.level })}
          </Link>
        )}
        {top && !score.unreliable && (
          <Link
            href={registerHrefForBook({ language: 'en', slug: top.slug })}
            data-testid="vocab-register"
            className={cn(
              buttonVariants({ size: 'lg', variant: fromSetup ? 'outline' : 'default' }),
              'min-h-11',
            )}
          >
            {t('cta', { title: topTitle })}
          </Link>
        )}
        <Button
          variant="outline"
          size="lg"
          className="min-h-11"
          onClick={begin}
          data-testid="vocab-retake"
        >
          {t('retake')}
        </Button>
      </div>
      <p className="text-sm">
        <Link href="/books" className="underline hover:text-foreground">
          {t('browse')}
        </Link>
      </p>
      {data.source && (
        <p className="text-xs text-muted-foreground">{t('credit', { source: data.source })}</p>
      )}
    </section>
  );
}
