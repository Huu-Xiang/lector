'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Check, CircleHelp, X } from 'lucide-react';
import { buttonVariants, Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { registerHrefForBook } from '@/lib/pending-book';
import {
  FIRST_ESTIMATE_AFTER,
  MAX_ANSWERS,
  MIN_ANSWERS,
  NONE_OF_ABOVE,
  estimateFromAnswers,
  missedWords,
  nextItem,
  prepareNext,
  recommendBooks,
  type Answer,
  type LiveEstimate,
  type SenseRow,
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

/** How long feedback stays before the next word, and how long a new word ignores input. */
const RIGHT_PAUSE_MS = 600;
const OTHER_PAUSE_MS = 1500;
const INPUT_LOCK_MS = 250;

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

/** "n. 银行；河岸" for screen-reader announcements. */
function meaningText(rows: readonly SenseRow[]): string {
  return rows.map((row) => `${row.p} ${row.zh.join('；')}`).join(' / ');
}

type Step = 'intro' | 'test' | 'result';
/** locked: a new word ignores input; asking: waiting for an answer; feedback: showing right or wrong. */
type Phase = 'locked' | 'asking' | 'feedback';
type OptionState = 'idle' | 'right' | 'answer' | 'unsure' | 'wrong' | 'other';
type Outcome = 'Right' | 'Unsure' | 'Wrong';

function outcome(choice: number | null, item: TestItem): Outcome {
  if (choice === item.answer) return 'Right';
  return choice === null ? 'Unsure' : 'Wrong';
}

function optionState(index: number, item: TestItem, choice: number | null | undefined): OptionState {
  if (choice === undefined) return 'idle';
  if (index === item.answer) {
    if (choice === item.answer) return 'right';
    return choice === null ? 'unsure' : 'answer';
  }
  return index === choice ? 'wrong' : 'other';
}

// `!` because the outline button sets its own background and border, also in dark mode.
const RIGHT_STYLE = 'border-2 border-answer-right-border! bg-answer-right!';
const OPTION_STYLES: Record<OptionState, string> = {
  idle: '',
  right: RIGHT_STYLE,
  answer: RIGHT_STYLE,
  unsure: 'border-2 border-answer-unsure-border! bg-answer-unsure!',
  wrong: 'border-2 border-answer-wrong-border! bg-answer-wrong!',
  other: 'opacity-60',
};

function MeaningRows({ rows }: { rows: readonly SenseRow[] }) {
  return (
    <span className="block min-w-0 space-y-1">
      {rows.map((row) => (
        <span key={row.p} className="block">
          <span className="mr-1.5 text-sm font-medium text-muted-foreground">{row.p}</span>
          <span lang="zh-CN">{row.zh.join('；')}</span>
          <span lang="en" className="block text-sm leading-snug text-muted-foreground">
            {row.en}
          </span>
        </span>
      ))}
    </span>
  );
}

function OptionIcon({ state }: { state: OptionState }) {
  if (state === 'right' || state === 'answer' || state === 'unsure') {
    return <Check className="size-5 text-answer-icon-right" aria-hidden="true" />;
  }
  if (state === 'wrong') return <X className="size-5 text-answer-icon-wrong" aria-hidden="true" />;
  return null;
}

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
  const [phase, setPhase] = useState<Phase>('locked');
  /** The choice for the current word once answered; undefined while asking. */
  const [chosen, setChosen] = useState<number | null | undefined>(undefined);
  const [announcement, setAnnouncement] = useState('');
  const seedRef = useRef(1);
  const answersRef = useRef<Answer[]>([]);
  const preparedRef = useRef<{
    id: string;
    right: TestItem | null;
    notRight: TestItem | null;
  } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastResult, setLastResult] = useState<ReturnType<typeof readVocabResult>>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the saved result is in localStorage
    setLastResult(readVocabResult());
  }, []);

  useEffect(() => {
    if (step !== 'intro') headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  useEffect(() => clearTimer, []);

  // A new word: ignore input for a moment, focus the card, and prepare both possible next words
  // after it has painted.
  useEffect(() => {
    if (step !== 'test' || !current) return;
    cardRef.current?.focus();
    const item = current;
    const lock = setTimeout(() => setPhase('asking'), INPUT_LOCK_MS);
    const prepare = setTimeout(() => {
      preparedRef.current = {
        id: item.id,
        ...prepareNext(answersRef.current, item, data, seedRef.current),
      };
    }, 0);
    return () => {
      clearTimeout(lock);
      clearTimeout(prepare);
    };
  }, [current, step, data]);

  const live = useMemo(() => estimateFromAnswers(answers, data.bands), [answers, data.bands]);

  function showItem(item: TestItem | null) {
    setChosen(undefined);
    setPhase('locked');
    setCurrent(item);
  }

  function begin() {
    clearTimer();
    seedRef.current = randomSeed();
    preparedRef.current = null;
    setAnswers([]);
    answersRef.current = [];
    setAnnouncement('');
    showItem(nextItem([], data, seedRef.current));
    setStep('test');
    window.scrollTo({ top: 0 });
  }

  const finish = useCallback(
    (all: readonly Answer[]) => {
      clearTimer();
      const result = estimateFromAnswers(all, data.bands);
      if (result) writeVocabResult(result.estimate, result.level);
      setStep('result');
      window.scrollTo({ top: 0 });
    },
    [data.bands],
  );

  const advance = useCallback(() => {
    clearTimer();
    if (phase !== 'feedback' || !current) return;
    const all = answersRef.current;
    const right = chosen === current.answer;
    const prepared =
      preparedRef.current?.id === current.id
        ? preparedRef.current
        : { id: current.id, ...prepareNext(all.slice(0, -1), current, data, seedRef.current) };
    const next = all.length >= MAX_ANSWERS ? null : right ? prepared.right : prepared.notRight;
    if (!next) {
      setCurrent(null);
      finish(all);
      return;
    }
    showItem(next);
  }, [phase, current, chosen, data, finish]);
  // The feedback timer fires after a re-render, so it calls the latest `advance` through a ref.
  const advanceRef = useRef(advance);
  useEffect(() => {
    advanceRef.current = advance;
  }, [advance]);

  const answer = useCallback(
    (choice: number | null) => {
      if (phase !== 'asking' || !current) return;
      const all = [...answersRef.current, { item: current, choice }];
      answersRef.current = all;
      setAnswers(all);
      setChosen(choice);
      setPhase('feedback');
      setAnnouncement(
        t(`announce${outcome(choice, current)}`, {
          word: current.word,
          meaning: meaningText(current.senses),
        }),
      );
      clearTimer();
      timerRef.current = setTimeout(
        () => advanceRef.current(),
        choice === current.answer ? RIGHT_PAUSE_MS : OTHER_PAUSE_MS,
      );
    },
    [phase, current, t],
  );

  function keepGoing() {
    showItem(nextItem(answersRef.current, data, seedRef.current));
    setStep('test');
    window.scrollTo({ top: 0 });
  }

  useEffect(() => {
    if (step !== 'test') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(event.key)) return;
      if (phase === 'feedback') {
        event.preventDefault();
        advance();
        return;
      }
      if (phase !== 'asking') {
        if (/^[0-5]$/.test(event.key) || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
        }
        return;
      }
      if (['1', '2', '3', '4'].includes(event.key)) answer(Number(event.key) - 1);
      else if (event.key === '0' || event.key === '5') answer(null);
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, phase, answer, advance]);

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
    const answered = chosen !== undefined;
    const feedbackText =
      current && chosen !== undefined ? t(`feedback${outcome(chosen, current)}`) : '';
    const options = current
      ? [...current.meanings.map((rows) => ({ rows })), { rows: null }]
      : [];
    return (
      <section
        className="space-y-4"
        data-testid="vocab-test"
        // While feedback shows, a tap anywhere goes on to the next word and never answers it.
        onClickCapture={(event) => {
          if (phase !== 'feedback') return;
          if ((event.target as HTMLElement).closest('[data-feedback-pass]')) return;
          event.preventDefault();
          event.stopPropagation();
          advance();
        }}
      >
        <h2 ref={headingRef} tabIndex={-1} className="sr-only">
          {t('testHeading')}
        </h2>
        <LivePanel
          live={live}
          waiting={FIRST_ESTIMATE_AFTER - answers.length}
          answered={answers.length}
        />
        <p className="sr-only" aria-live="polite" data-testid="vocab-announcement">
          {announcement}
        </p>

        {current && (
          <div
            ref={cardRef}
            tabIndex={-1}
            data-testid="vocab-card"
            data-state={phase}
            data-answer={answered ? String(current.answer) : undefined}
            className="rounded-2xl border border-border bg-card p-4 outline-none sm:p-6"
          >
            <p
              lang="en"
              className="text-center text-3xl font-bold tracking-tight break-words sm:text-4xl"
              data-testid="vocab-word"
            >
              {current.word}
            </p>
            <p className="mt-1 text-center text-sm text-muted-foreground">{t('chooseMeaning')}</p>
            <ul className="mt-4 grid gap-2 text-left sm:grid-cols-2">
              {options.map((option, index) => {
                const state = optionState(index, current, chosen);
                return (
                  <li key={`${current.id}:${index}`}>
                    <Button
                      variant="outline"
                      size="lg"
                      aria-disabled={phase !== 'asking'}
                      className={cn(
                        'h-auto min-h-12 w-full items-start justify-start gap-2 py-2.5 text-left text-base font-normal whitespace-normal transition-colors motion-reduce:transition-none',
                        option.rows === null && 'items-center',
                        OPTION_STYLES[state],
                      )}
                      onClick={() => answer(index)}
                      data-testid="vocab-option"
                      data-state={state}
                    >
                      <span
                        className="w-4 shrink-0 pt-0.5 text-sm text-muted-foreground"
                        aria-hidden="true"
                      >
                        {index + 1}
                      </span>
                      {option.rows ? (
                        <MeaningRows rows={option.rows} />
                      ) : (
                        <span className="flex-1 font-medium">{t('noneOfAbove')}</span>
                      )}
                      <span className="ml-auto flex size-5 shrink-0 items-center">
                        <OptionIcon state={state} />
                      </span>
                    </Button>
                  </li>
                );
              })}
            </ul>
            <Button
              variant="secondary"
              size="lg"
              aria-disabled={phase !== 'asking'}
              className={cn(
                'mt-2 min-h-12 w-full gap-2 text-base transition-colors motion-reduce:transition-none',
                answered && chosen === null && 'border-2 border-answer-unsure-border! bg-answer-unsure!',
              )}
              onClick={() => answer(null)}
              data-testid="vocab-not-sure"
            >
              {answered && chosen === null && (
                <CircleHelp className="size-5 text-answer-icon-right" aria-hidden="true" />
              )}
              {t('notSure')}
            </Button>
            {/* One fixed slot for the hint before an answer and the feedback after it. */}
            <div className="mt-3 min-h-[4.5rem] text-sm" data-testid="vocab-feedback">
              {answered ? (
                <>
                  <p className="font-semibold">
                    {feedbackText}
                    <span className="ml-2 font-normal text-muted-foreground">{t('skipHint')}</span>
                  </p>
                  {current.answer === NONE_OF_ABOVE && (
                    <div className="mt-1.5 flex gap-2" data-testid="vocab-true-meaning">
                      <span className="shrink-0 text-muted-foreground">{t('trueMeaning')}</span>
                      <MeaningRows rows={current.senses} />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-muted-foreground">{t('dontKnowHint')}</p>
                  <p className="mt-1 hidden text-xs text-muted-foreground sm:block">
                    {t('keysHint')}
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            size="lg"
            variant={live?.precision === 'high' ? 'default' : 'outline'}
            className="min-h-11"
            disabled={!canFinish}
            onClick={() => finish(answersRef.current)}
            data-testid="vocab-finish"
            data-feedback-pass=""
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
                {item.senses.map((row) => (
                  <span key={row.p} className="ml-2 text-muted-foreground">
                    {row.p}{' '}
                    {locale === 'zh-CN' ? (
                      <span lang="zh-CN">{row.zh.join('；')}</span>
                    ) : (
                      <span lang="en">{row.en}</span>
                    )}
                  </span>
                ))}
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
