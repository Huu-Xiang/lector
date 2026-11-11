'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { buttonVariants, Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { registerHrefForBook } from '@/lib/pending-book';
import {
  FIRST_ESTIMATE_AFTER,
  MIN_ANSWERS,
  estimateFromAnswers,
  missedWords,
  nextItem,
  recommendBooks,
  seededRng,
  type Answer,
  type LiveEstimate,
  type Rng,
  type TestItem,
  type VocabTestData,
} from '@/lib/vocab-test';
import { readVocabResult, writeVocabResult } from '@/lib/vocab-result';
import type { VocabTestBook } from '@/lib/vocab-test-data';

/** The live bar runs to the end of the hardest band on a square-root scale, so small counts stay readable. */
const SCALE_MAX = 40000;
const SCALE_MARKS = [0, 2500, 10000, 22500, 40000];
const scalePosition = (n: number) =>
  `${Math.sqrt(Math.min(Math.max(n, 0), SCALE_MAX) / SCALE_MAX) * 100}%`;

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
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [current, setCurrent] = useState<TestItem | null>(null);
  const rngRef = useRef<Rng>(seededRng(1));
  const [lastResult, setLastResult] = useState<ReturnType<typeof readVocabResult>>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the saved result is in localStorage
    setLastResult(readVocabResult());
  }, []);

  useEffect(() => {
    if (step !== 'intro') headingRef.current?.focus();
  }, [step]);

  const live = useMemo(() => estimateFromAnswers(answers, data.bands), [answers, data.bands]);

  function begin() {
    rngRef.current = seededRng(randomSeed());
    setAnswers([]);
    setCurrent(nextItem([], data, rngRef.current));
    setStep('test');
    window.scrollTo({ top: 0 });
  }

  const finish = useCallback(
    (all: readonly Answer[]) => {
      const result = estimateFromAnswers(all, data.bands);
      if (result) writeVocabResult(result.estimate, result.level);
      setStep('result');
      window.scrollTo({ top: 0 });
    },
    [data.bands],
  );

  const answer = useCallback(
    (choice: number | null) => {
      if (!current) return;
      const next = [...answers, { item: current, choice }];
      setAnswers(next);
      const following = nextItem(next, data, rngRef.current);
      setCurrent(following);
      if (!following) finish(next);
    },
    [answers, current, data, finish],
  );

  function undo() {
    const last = answers[answers.length - 1];
    if (!last) return;
    setAnswers(answers.slice(0, -1));
    setCurrent(last.item);
  }

  function keepGoing() {
    setCurrent(nextItem(answers, data, rngRef.current));
    setStep('test');
    window.scrollTo({ top: 0 });
  }

  useEffect(() => {
    if (step !== 'test') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (['1', '2', '3', '4'].includes(event.key)) answer(Number(event.key) - 1);
      else if (event.key === '0' || event.key === '5') answer(null);
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, answer]);

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
    const canFinish = answers.length >= MIN_ANSWERS && live !== null;
    return (
      <section className="space-y-5" data-testid="vocab-test">
        <h2 ref={headingRef} tabIndex={-1} className="sr-only">
          {t('testHeading')}
        </h2>
        <LivePanel
          live={live}
          waiting={FIRST_ESTIMATE_AFTER - answers.length}
          answered={answers.length}
        />

        {current && (
          <div className="rounded-2xl border border-border bg-card p-6 text-center">
            <p
              lang="en"
              aria-live="polite"
              className="text-4xl font-bold tracking-tight break-words"
              data-testid="vocab-word"
            >
              {current.word}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{t('chooseMeaning')}</p>
            <ul className="mt-5 grid gap-2 text-left sm:grid-cols-2" lang="zh-CN">
              {current.options.map((option, index) => (
                <li key={`${current.id}:${option}`}>
                  <Button
                    variant="outline"
                    size="lg"
                    className="h-auto min-h-12 w-full justify-start py-2 text-left text-base whitespace-normal"
                    onClick={() => answer(index)}
                    data-testid="vocab-option"
                  >
                    <span className="mr-2 text-sm text-muted-foreground" aria-hidden="true">
                      {index + 1}
                    </span>
                    {option}
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              variant="secondary"
              size="lg"
              className="mt-3 min-h-12 w-full text-base"
              onClick={() => answer(null)}
              data-testid="vocab-not-sure"
            >
              {t('notSure')}
            </Button>
            <p className="mt-4 text-sm text-muted-foreground">{t('dontKnowHint')}</p>
            <p className="mt-1 hidden text-xs text-muted-foreground sm:block">{t('keysHint')}</p>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={answers.length === 0}
            onClick={undo}
            data-testid="vocab-undo"
          >
            {t('undo')}
          </Button>
          <Button
            size="lg"
            variant={live?.precision === 'high' ? 'default' : 'outline'}
            className="min-h-11"
            disabled={!canFinish}
            onClick={() => finish(answers)}
            data-testid="vocab-finish"
          >
            {canFinish
              ? t('seeResult')
              : t('seeResultAfter', { count: Math.max(1, MIN_ANSWERS - answers.length) })}
          </Button>
        </div>
      </section>
    );
  }

  const score = live;
  if (!score) return null;
  const fromSetup = new URLSearchParams(window.location.search).get('from') === 'setup';
  const recommended = recommendBooks(books, score.estimate, score.level);
  const missed = missedWords(answers, score.estimate, data.bands);
  const top = recommended[0];
  const topTitle = top ? shownTitle(top, locale) : '';

  return (
    <section className="space-y-6" data-testid="vocab-result">
      <div className="rounded-2xl border border-border bg-card p-5 text-center">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-sm font-semibold text-muted-foreground outline-none"
        >
          {t('resultHeading')}
        </h2>
        <p
          className="mt-2 text-3xl font-bold tracking-tight text-balance sm:text-4xl"
          data-testid="vocab-estimate"
        >
          {score.capped
            ? t('estimateCapped')
            : score.low === 0
              ? t('estimateRange', { high: score.high })
              : t('estimate', { count: score.estimate, margin: score.margin })}
        </p>
        <p className="mt-1 text-muted-foreground" data-testid="vocab-precision">
          {t('precisionResult', {
            level: t(`precisionLevel.${score.precision}`),
            count: score.answered,
          })}
        </p>
        <p className="mt-3 text-xl font-semibold" data-testid="vocab-level">
          {t('level', { level: score.level })}
        </p>
        <p className="mt-3 text-muted-foreground">{t('explain')}</p>
      </div>

      {score.guessing && (
        <div
          role="note"
          data-testid="vocab-guessing"
          className="rounded-xl border border-border bg-muted/50 p-4"
        >
          <p className="font-semibold">{t('guessingTitle')}</p>
          <p className="mt-1">{t('guessingBody')}</p>
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

      {recommended.length > 0 && (
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
        {fromSetup && (
          <Link
            href="/setup"
            onClick={() => writeVocabResult(score.estimate, score.level)}
            data-testid="vocab-continue-setup"
            className={cn(buttonVariants({ size: 'lg' }), 'min-h-11')}
          >
            {t('useLevel', { level: score.level })}
          </Link>
        )}
        {top && (
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
        {score.precision !== 'high' && current !== null && (
          <Button
            variant="outline"
            size="lg"
            className="min-h-11"
            onClick={keepGoing}
            data-testid="vocab-continue"
          >
            {t('continue')}
          </Button>
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

function LivePanel({
  live,
  waiting,
  answered,
}: {
  live: LiveEstimate | null;
  waiting: number;
  answered: number;
}) {
  const t = useTranslations('vocabTest');
  return (
    <div className="rounded-2xl border border-border bg-card p-4" data-testid="vocab-live">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold" aria-live="polite" data-testid="vocab-live-estimate">
          {live === null
            ? t('liveWaiting', { count: Math.max(1, waiting) })
            : live.capped
              ? t('liveCapped')
              : live.low === 0
                ? t('liveRange', { high: live.high })
                : t('liveEstimate', { count: live.estimate, margin: live.margin })}
        </p>
        <p className="shrink-0 text-sm text-muted-foreground" data-testid="vocab-answered">
          {t('answered', { count: answered })}
        </p>
      </div>
      <div
        className="relative mt-3 h-3 rounded-full bg-muted"
        role="img"
        aria-label={
          live === null
            ? t('liveWaiting', { count: Math.max(1, waiting) })
            : live.low === 0
              ? t('liveRange', { high: live.high })
              : t('liveEstimate', { count: live.estimate, margin: live.margin })
        }
      >
        {live !== null && (
          <>
            <div
              className="absolute inset-y-0 rounded-full bg-primary/30 transition-all duration-300 motion-reduce:transition-none"
              style={{
                left: scalePosition(live.low),
                width: `calc(${scalePosition(live.high)} - ${scalePosition(live.low)})`,
              }}
            />
            <div
              className="absolute -top-1 -bottom-1 w-1 -translate-x-1/2 rounded-full bg-primary transition-all duration-300 motion-reduce:transition-none"
              style={{ left: scalePosition(live.estimate) }}
            />
          </>
        )}
      </div>
      <div className="relative mt-1 h-4 text-xs text-muted-foreground" aria-hidden="true">
        {SCALE_MARKS.map((mark, index) => (
          <span
            key={mark}
            className={cn(
              'absolute',
              index === 0
                ? ''
                : index === SCALE_MARKS.length - 1
                  ? '-translate-x-full'
                  : '-translate-x-1/2',
            )}
            style={{ left: scalePosition(mark) }}
          >
            {mark.toLocaleString('en')}
          </span>
        ))}
      </div>
      {live !== null && (
        <p className="mt-2 text-sm text-muted-foreground" data-testid="vocab-live-precision">
          {t('precision', { level: t(`precisionLevel.${live.precision}`) })}
          {' · '}
          {live.precision === 'high' ? t('enough') : t('precisionHint')}
        </p>
      )}
    </div>
  );
}
