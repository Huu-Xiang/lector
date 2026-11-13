'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Check, CircleHelp, X } from 'lucide-react';
import { buttonVariants, Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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
  type VocabBand,
  type VocabTestData,
} from '@/lib/vocab-test';
import { readVocabResult, writeVocabResult } from '@/lib/vocab-result';
import { addSeenWord, readSeenWords } from '@/lib/vocab-seen';
import { authClient } from '@/lib/auth-client';
import { useLectorMode } from '@/lib/use-env';
import SaveLevel from './SaveLevel';
import SaveReport from './SaveReport';
import { ReportEstimate, ReportHistoryLink } from './ReportRecord';
import { VOCAB_REPORT_LOCALES, type VocabReportSnapshot } from '../../../languages/en/vocab-report';
import type { VocabTestBook } from '@/lib/vocab-test-data';

/** How long feedback stays before the next word, and how long a new word ignores input. */
const RIGHT_PAUSE_MS = 600;
const OTHER_PAUSE_MS = 1500;
const INPUT_LOCK_MS = 250;

function shownTitle(book: VocabTestBook, locale: string): string {
  return book.titles[locale] ?? book.titles.en ?? book.title;
}

export const WORDS_URL = '/vocab-test/words';

function isTestData(value: unknown): value is VocabTestData {
  const bands = (value as VocabTestData | null)?.bands;
  return Array.isArray(bands) && bands.length > 0 && bands.every((b) => Array.isArray(b.words));
}

/** The band limits and data credit: all the page needs before the word list loads. */
export interface VocabTestMeta {
  bands: Array<Pick<VocabBand, 'from' | 'to'>>;
  source?: string;
  answerLanguage?: 'ru';
}

function randomSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  } catch {
    return Math.floor(Math.random() * 2 ** 32);
  }
}

const RUSSIAN_PARTS_OF_SPEECH: Record<string, string> = {
  'adj.': 'прил.',
  'adv.': 'нареч.',
  'conj.': 'союз',
  'n.': 'сущ.',
  'num.': 'числ.',
  'prep.': 'предл.',
  'pron.': 'мест.',
  'v.': 'гл.',
};

function partOfSpeech(row: SenseRow, russian: boolean): string {
  return russian ? (RUSSIAN_PARTS_OF_SPEECH[row.p] ?? row.p) : row.p;
}

function glossText(row: SenseRow, russian: boolean): string {
  return russian ? (row.ru ?? []).join('; ') : (row.zh ?? []).join('；');
}

function meaningText(rows: readonly SenseRow[], russian: boolean): string {
  return rows.map((row) => `${partOfSpeech(row, russian)} ${glossText(row, russian)}`).join(' / ');
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

function optionState(
  index: number,
  item: TestItem,
  choice: number | null | undefined,
): OptionState {
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

function MeaningRows({
  rows,
  russian,
  showEnglish = true,
}: {
  rows: readonly SenseRow[];
  russian: boolean;
  showEnglish?: boolean;
}) {
  return (
    <span className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1.5">
      {rows.map((row) => (
        <span key={row.p} className="contents">
          <span className="pt-0.5 text-sm text-muted-foreground">{partOfSpeech(row, russian)}</span>
          <span className="min-w-0">
            <span lang={russian ? 'ru' : 'zh-CN'} className="block font-medium">
              {glossText(row, russian)}
            </span>
            {showEnglish && !russian && (
              <span lang="en" className="block text-sm leading-snug text-muted-foreground">
                {row.en}
              </span>
            )}
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
  meta,
  books,
}: {
  meta: VocabTestMeta;
  books: VocabTestBook[];
}) {
  const t = useTranslations('vocabTest');
  const locale = useLocale();
  const russian = meta.answerLanguage === 'ru';
  const { data: session } = authClient.useSession();
  // Without cloud accounts every visitor is the one local user, whose settings always save.
  const mode = useLectorMode();
  const cloud = mode === 'cloud';
  const hasAccount = !cloud || Boolean(session);
  const [step, setStep] = useState<Step>('intro');
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [current, setCurrent] = useState<TestItem | null>(null);
  const [phase, setPhase] = useState<Phase>('locked');
  /** The choice for the current word once answered; undefined while asking. */
  const [chosen, setChosen] = useState<number | null | undefined>(undefined);
  const [announcement, setAnnouncement] = useState('');
  const [estimateBeforeAnswer, setEstimateBeforeAnswer] = useState<number | null>(null);
  const [data, setData] = useState<VocabTestData | null>(null);
  const [loading, setLoading] = useState<'idle' | 'loading' | 'error'>('idle');
  const seedRef = useRef(1);
  /** Words asked in earlier tests in this browser, read when a test starts. */
  const seenRef = useRef<ReadonlySet<string>>(new Set());
  const answersRef = useRef<Answer[]>([]);
  const resultVersion = useRef<{
    answered: number;
    takenAt: string;
    snapshot?: VocabReportSnapshot;
  } | null>(null);
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
    if (step !== 'test' || !current || !data) return;
    cardRef.current?.focus();
    const item = current;
    const lock = setTimeout(() => setPhase('asking'), INPUT_LOCK_MS);
    const prepare = setTimeout(() => {
      preparedRef.current = {
        id: item.id,
        ...prepareNext(answersRef.current, item, data, seedRef.current, seenRef.current),
      };
    }, 0);
    return () => {
      clearTimeout(lock);
      clearTimeout(prepare);
    };
  }, [current, step, data]);

  const live = useMemo(() => estimateFromAnswers(answers, meta.bands), [answers, meta.bands]);

  function showItem(item: TestItem | null) {
    setChosen(undefined);
    setPhase('locked');
    setCurrent(item);
  }

  function start(words: VocabTestData) {
    clearTimer();
    seedRef.current = randomSeed();
    seenRef.current = new Set(readSeenWords());
    preparedRef.current = null;
    setAnswers([]);
    answersRef.current = [];
    resultVersion.current = null;
    setAnnouncement('');
    showItem(nextItem([], words, seedRef.current, seenRef.current));
    setStep('test');
    window.scrollTo({ top: 0 });
  }

  async function begin() {
    if (data) {
      start(data);
      return;
    }
    if (loading === 'loading') return;
    setLoading('loading');
    try {
      const response = await fetch(russian ? `${WORDS_URL}/ru` : WORDS_URL);
      const words: unknown = response.ok ? await response.json() : null;
      if (!isTestData(words) || words.answerLanguage !== meta.answerLanguage) {
        throw new Error('bad word list');
      }
      setData(words);
      setLoading('idle');
      start(words);
    } catch {
      setLoading('error');
    }
  }

  const finish = useCallback(
    (all: readonly Answer[]) => {
      clearTimer();
      const result = estimateFromAnswers(all, meta.bands);
      if (result) {
        writeVocabResult(result.estimate, result.level);
        if (resultVersion.current?.answered !== all.length) {
          resultVersion.current = { answered: all.length, takenAt: new Date().toISOString() };
        }
      }
      setStep('result');
      window.scrollTo({ top: 0 });
    },
    [meta.bands],
  );

  const advance = useCallback(() => {
    clearTimer();
    if (phase !== 'feedback' || !current || !data) return;
    const all = answersRef.current;
    const right = chosen === current.answer;
    const prepared =
      preparedRef.current?.id === current.id
        ? preparedRef.current
        : {
            id: current.id,
            ...prepareNext(all.slice(0, -1), current, data, seedRef.current, seenRef.current),
          };
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
      setEstimateBeforeAnswer(live ? (live.low + live.high) / 2 : null);
      const all = [...answersRef.current, { item: current, choice }];
      answersRef.current = all;
      setAnswers(all);
      addSeenWord(current.word);
      setChosen(choice);
      setPhase('feedback');
      setAnnouncement(
        t(`announce${outcome(choice, current)}`, {
          word: current.word,
          meaning: meaningText(current.senses, russian),
        }),
      );
      clearTimer();
      timerRef.current = setTimeout(
        () => advanceRef.current(),
        choice === current.answer ? RIGHT_PAUSE_MS : OTHER_PAUSE_MS,
      );
    },
    [phase, current, live, t, russian],
  );

  function keepGoing() {
    if (!data) return;
    showItem(nextItem(answersRef.current, data, seedRef.current, seenRef.current));
    setStep('test');
    window.scrollTo({ top: 0 });
  }

  useEffect(() => {
    if (step !== 'test') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      // A held key would otherwise answer the next word as soon as the input lock ends.
      if (event.repeat) {
        event.preventDefault();
        return;
      }
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
      <section
        className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-8"
        data-testid="vocab-intro"
      >
        <p className="max-w-prose text-lg leading-relaxed text-foreground">{t('introLead')}</p>
        <p className="text-sm text-muted-foreground">{t('introFacts')}</p>
        {lastResult && (
          <p className="text-base font-medium" data-testid="vocab-last-result">
            {t('lastResult', { count: lastResult.estimate })}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <Button
            size="lg"
            onClick={begin}
            disabled={mode === 'unknown' || loading === 'loading'}
            aria-busy={loading === 'loading'}
            data-testid="vocab-start"
            className="min-h-11"
          >
            {loading === 'loading'
              ? t('loading')
              : loading === 'error'
                ? t('retryStart')
                : t('start')}
          </Button>
          {cloud && session?.user.emailVerified && <ReportHistoryLink />}
        </div>
        {loading === 'error' && (
          <p role="alert" className="text-sm text-destructive" data-testid="vocab-load-error">
            {t('loadError')}
          </p>
        )}
        {meta.source && (
          <p className="text-xs text-muted-foreground">{t('credit', { source: meta.source })}</p>
        )}
      </section>
    );
  }

  if (step === 'test') {
    const canFinish = answers.length >= MIN_ANSWERS && live !== null;
    const answered = chosen !== undefined;
    const feedbackText =
      current && chosen !== undefined ? t(`feedback${outcome(chosen, current)}`) : '';
    const midpoint = live ? (live.low + live.high) / 2 : null;
    const estimateChange =
      midpoint !== null && estimateBeforeAnswer !== null ? midpoint - estimateBeforeAnswer : null;
    const options = current ? [...current.meanings.map((rows) => ({ rows })), { rows: null }] : [];
    return (
      <section
        className="mx-auto max-w-2xl space-y-3"
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
        <LivePanel live={live} waiting={FIRST_ESTIMATE_AFTER - answers.length} answers={answers} />
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
            className="px-1 pt-3 outline-none sm:px-3 sm:pt-6"
          >
            <p
              lang="en"
              className="text-center text-4xl font-bold tracking-tight break-words sm:text-5xl"
              data-testid="vocab-word"
            >
              {current.word}
            </p>
            <p className="mt-1 text-center text-sm text-muted-foreground">{t('chooseMeaning')}</p>
            <ul className="mt-4 grid gap-2 text-left">
              {options.map((option, index) => {
                const state = optionState(index, current, chosen);
                return (
                  <li key={`${current.id}:${index}`}>
                    <Button
                      variant="outline"
                      size="lg"
                      aria-disabled={phase !== 'asking'}
                      className={cn(
                        'h-auto min-h-12 w-full items-start justify-start gap-2.5 px-3 py-2 text-left text-base font-normal whitespace-normal transition-colors motion-reduce:transition-none sm:px-4',
                        option.rows === null && 'items-center',
                        OPTION_STYLES[state],
                      )}
                      onClick={() => answer(index)}
                      data-testid="vocab-option"
                      data-state={state}
                    >
                      <kbd
                        className="flex size-6 shrink-0 items-center justify-center border-r border-border pr-2 font-sans text-xs font-semibold text-muted-foreground"
                        aria-hidden="true"
                      >
                        {index + 1}
                      </kbd>
                      {option.rows ? (
                        <MeaningRows rows={option.rows} russian={russian} showEnglish={false} />
                      ) : (
                        <span className="flex-1 font-medium">{t('noneOfAbove')}</span>
                      )}
                      <span className="ml-auto flex size-4 shrink-0 items-center">
                        <OptionIcon state={state} />
                      </span>
                    </Button>
                  </li>
                );
              })}
            </ul>
            <Button
              variant="outline"
              size="lg"
              aria-disabled={phase !== 'asking'}
              className={cn(
                'mt-2 min-h-11 w-full gap-2 border-border bg-muted/50 text-base font-semibold transition-colors motion-reduce:transition-none',
                answered &&
                  chosen === null &&
                  'border-2 border-answer-unsure-border! bg-answer-unsure!',
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
            <div className="mt-3 min-h-12 text-center text-sm" data-testid="vocab-feedback">
              {answered ? (
                <>
                  <p className="font-semibold">
                    {feedbackText}
                    {midpoint !== null && (
                      <span
                        className={cn(
                          'ml-2 inline-block rounded-md bg-muted px-2 py-0.5 font-bold whitespace-nowrap tabular-nums motion-safe:animate-[vocab-answer-float_480ms_ease-out_both]',
                          estimateChange === null || estimateChange === 0
                            ? 'text-foreground'
                            : estimateChange > 0
                              ? 'text-answer-icon-right'
                              : 'text-answer-icon-wrong',
                        )}
                        data-testid="vocab-estimate-change"
                      >
                        {estimateChange === null
                          ? t('initialEstimate', { count: midpoint })
                          : t('estimateChange', {
                              change: new Intl.NumberFormat(locale, {
                                signDisplay: 'exceptZero',
                              }).format(estimateChange),
                            })}
                      </span>
                    )}
                    <span className="ml-2 font-normal text-muted-foreground">{t('skipHint')}</span>
                  </p>
                  {current.answer === NONE_OF_ABOVE && (
                    <div
                      className="mx-auto mt-2 flex max-w-md gap-2 text-left"
                      data-testid="vocab-true-meaning"
                    >
                      <span className="shrink-0 pt-0.5 text-muted-foreground">
                        {t('trueMeaning')}
                      </span>
                      <MeaningRows rows={current.senses} russian={russian} />
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
            variant={canFinish ? 'default' : 'outline'}
            className="min-h-11 w-full sm:w-auto"
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
  const missed = missedWords(answers, score.estimate, meta.bands);
  const canContinue = score.precision !== 'high' && current !== null;
  const createSnapshot = (): VocabReportSnapshot => {
    const version = resultVersion.current ?? {
      answered: answers.length,
      takenAt: new Date().toISOString(),
    };
    resultVersion.current = version;
    return (version.snapshot ??= {
      attemptId: crypto.randomUUID(),
      takenAt: version.takenAt,
      locale: VOCAB_REPORT_LOCALES.find((value) => value === locale) ?? 'en',
      estimate: score.estimate,
      margin: score.margin,
      low: score.low,
      high: score.high,
      capped: score.capped,
      level: score.level,
      bookSlugs: recommended.map((book) => book.slug),
    });
  };

  return (
    <section className="space-y-4 sm:space-y-5" data-testid="vocab-result">
      <div className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-sm font-semibold text-muted-foreground outline-none"
        >
          {t('resultHeading')}
        </h2>
        <p
          className="text-2xl leading-tight font-bold tracking-tight text-balance sm:text-3xl"
          data-testid="vocab-estimate"
        >
          <ReportEstimate score={score} />
        </p>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          <p className="font-semibold" data-testid="vocab-level">
            {t('level', { level: score.level })}
          </p>
          <p className="native-subtitle text-muted-foreground" data-testid="vocab-precision">
            {t('precisionResult', {
              level: t(`precisionLevel.${score.precision}`),
              count: score.answered,
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
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
          {canContinue && (
            <Button
              variant={fromSetup ? 'outline' : 'default'}
              size="default"
              className="min-h-11"
              onClick={keepGoing}
              data-testid="vocab-continue"
            >
              {t('continue')}
            </Button>
          )}
          <Button
            variant="ghost"
            size="default"
            className="min-h-11"
            onClick={begin}
            data-testid="vocab-retake"
          >
            {t('retake')}
          </Button>
        </div>
      </div>

      {cloud && (
        <SaveReport
          key={answers.length}
          createSnapshot={createSnapshot}
          secondary={canContinue || fromSetup}
        />
      )}
      {hasAccount && !fromSetup && <SaveLevel level={score.level} />}

      {score.guessing && (
        <div
          role="note"
          data-testid="vocab-guessing"
          className="rounded-xl border border-border bg-muted/50 p-4"
        >
          <p className="font-semibold">{t('guessingTitle')}</p>
          <p className="native-subtitle mt-1">{t('guessingBody')}</p>
        </div>
      )}

      {missed.length > 0 && (
        <details data-testid="vocab-missed" className="border-b border-border">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">
            {t('missedTitle')}{' '}
            <span className="font-normal text-muted-foreground">({missed.length})</span>
          </summary>
          <p className="native-subtitle text-sm text-muted-foreground">{t('missedHint')}</p>
          <ul className="mt-2 mb-3 flex flex-wrap gap-2">
            {missed.map((item) => (
              <li key={item.id} className="rounded-lg border border-border bg-card px-3 py-1.5">
                <span lang="en" className="font-medium">
                  {item.word}
                </span>
                {item.senses.map((row) => (
                  <span key={row.p} className="ml-2 text-muted-foreground">
                    {partOfSpeech(row, russian)}{' '}
                    {russian || locale.startsWith('zh') ? (
                      <span lang={russian ? 'ru' : 'zh-CN'}>{glossText(row, russian)}</span>
                    ) : (
                      <span lang="en">{row.en}</span>
                    )}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </details>
      )}

      {recommended.length > 0 && (
        <div data-testid="vocab-books">
          <h3 className="text-lg font-semibold">{t('booksTitle')}</h3>
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
                      <span className="native-subtitle block text-muted-foreground">
                        {book.author}
                      </span>
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

      <p className="text-sm text-muted-foreground">{t('explain')}</p>
      <p className="text-sm">
        <Link href="/books" className="underline hover:text-foreground">
          {t('browse')}
        </Link>
      </p>
      {meta.source && (
        <p className="text-xs text-muted-foreground">{t('credit', { source: meta.source })}</p>
      )}
    </section>
  );
}

function LivePanel({
  live,
  waiting,
  answers,
}: {
  live: LiveEstimate | null;
  waiting: number;
  answers: readonly Answer[];
}) {
  const t = useTranslations('vocabTest');
  const answered = answers.length;
  const right = answers.filter(({ item, choice }) => choice === item.answer).length;
  const unsure = answers.filter(({ choice }) => choice === null).length;
  const resultReady = answered >= MIN_ANSWERS && live !== null;
  return (
    <div
      className="space-y-3 rounded-xl border border-border bg-card p-3 sm:p-4"
      data-testid="vocab-live"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
        <p className="font-semibold tabular-nums" data-testid="vocab-live-estimate">
          {live === null
            ? t('liveWaiting', { count: Math.max(1, waiting) })
            : t('liveEstimate', {
                count: (live.low + live.high) / 2,
                margin: (live.high - live.low) / 2,
              })}
        </p>
        <p className="text-muted-foreground tabular-nums" data-testid="vocab-answered">
          {t('answered', { count: answered })}
        </p>
      </div>
      <div className="space-y-1.5">
        {!resultReady && (
          <div
            role="progressbar"
            aria-label={t('resultMilestone', { count: MIN_ANSWERS })}
            aria-valuemin={0}
            aria-valuemax={MIN_ANSWERS}
            aria-valuenow={answered}
            className="relative h-1.5 rounded-full bg-muted"
            data-testid="vocab-result-progress"
          >
            <div
              className="absolute inset-0 origin-left rounded-full bg-primary transition-transform duration-200 motion-reduce:transition-none"
              style={{ transform: `scaleX(${answered / MIN_ANSWERS})` }}
            />
            <span
              aria-hidden="true"
              className="absolute -inset-y-1 right-0 border-r border-foreground/60"
            />
          </div>
        )}
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {t('answerBreakdown', { right, unsure, wrong: answered - right - unsure })}
          </span>
          {resultReady ? (
            <span
              className="inline-flex items-center gap-1 font-semibold text-foreground"
              data-testid="vocab-result-ready"
            >
              <Check className="size-3.5" aria-hidden="true" />
              {t('resultReady')}
            </span>
          ) : (
            <span>{t('resultMilestone', { count: MIN_ANSWERS })}</span>
          )}
        </div>
      </div>
      {live && (
        <p className="text-xs text-muted-foreground" data-testid="vocab-live-precision">
          {t('precision', { level: t(`precisionLevel.${live.precision}`) })}
          {live.precision !== 'high' && ` · ${t('precisionHint')}`}
        </p>
      )}
    </div>
  );
}
