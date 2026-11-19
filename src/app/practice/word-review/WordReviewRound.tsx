'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { getActivePack } from '@/lib/data-layer';
import { trackProductEvent } from '@/lib/product-analytics';
import { hasAudio } from '@/lib/tts';
import type { ClozeSentence, ReviewItem, ReviewQuestionType } from '@/types';
import DictationCard from '../components/Dictation/DictationCard';
import { diffDictation, scoreDictation } from '../utils';
import ChooseMeaning from './ChooseMeaning';
import FillIn from './FillIn';
import RecognitionCard from './RecognitionCard';
import SentenceTranslation from './SentenceTranslation';
import SourceLine from './SourceLine';
import StageBadge from './StageBadge';
import TypedFillIn from './TypedFillIn';
import { effectiveQuestionType } from './questions';
import { useQuestionKeys } from './use-question-keys';
import { useShowTranslation } from './use-show-translation';
import { summarizeRound, useWordReviewRound } from './use-word-review-round';

function dictationCurrent(item: ReviewItem) {
  const sentence: ClozeSentence = {
    id: item.cardId,
    sentence: item.sentence,
    clozeWord: item.word,
    clozeIndex: 0,
    translation: item.sentenceTranslation?.text ?? item.translation,
    source: 'mined',
    collection: 'top500',
    masteryLevel: 0,
    nextReview: new Date(),
    reviewCount: 0,
    timesCorrect: 0,
    timesIncorrect: 0,
  };
  return { sentence, blankedSentence: item.sentence };
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-card p-5">{children}</div>;
}

export default function WordReviewRound({ onExit }: { onExit: () => void }) {
  const t = useTranslations('practice.words');
  const format = useFormatter();
  const { round, start, answer, undoKnow, advance, loadSentence } = useWordReviewRound();
  const [showTranslation, showTranslationNow] = useShowTranslation();
  const started = useRef(false);
  const completed = useRef<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void start();
  }, [start]);

  useEffect(() => {
    if (round.phase !== 'complete' || completed.current === round.roundId) return;
    completed.current = round.roundId;
    trackProductEvent({
      event: 'review_completed',
      roundId: round.roundId,
      value: round.answered.length,
    });
  }, [round.answered.length, round.phase, round.roundId]);

  const current =
    round.phase === 'practicing' || round.phase === 'feedback' ? round.queue[0] : null;
  const roundItems = useMemo(() => Object.values(round.items), [round.items]);
  const questionType: ReviewQuestionType | null = useMemo(
    () =>
      current ? effectiveQuestionType(current, roundItems, hasAudio(), getActivePack()) : null,
    [current, roundItems],
  );

  useEffect(() => {
    if (current && questionType && questionType !== 'choose_meaning') loadSentence(current);
  }, [current, questionType, loadSentence]);

  useQuestionKeys((event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    advance();
  }, round.phase === 'feedback');

  const formatDue = (due: string | null) =>
    due ? format.dateTime(new Date(due), { dateStyle: 'medium', timeStyle: 'short' }) : null;

  const wasWrong = round.pendingKnow && (
    <Button
      variant="link"
      size="sm"
      onClick={() => void undoKnow()}
      title={round.pendingKnow.word}
      data-testid="was-wrong"
    >
      {t('wasWrong')}
    </Button>
  );

  const back = (
    <Button variant="ghost" size="sm" onClick={onExit}>
      {t('back')}
    </Button>
  );

  if (round.phase === 'idle' || round.phase === 'loading') {
    return (
      <div className="py-6" data-testid="word-review-loading">
        <Shell>
          <div className="animate-pulse space-y-4 py-6" aria-label={t('loading')} role="status">
            <div className="mx-auto h-8 w-40 rounded bg-muted" />
            <div className="mx-auto h-4 w-64 rounded bg-muted" />
            <div className="mx-auto h-10 w-full rounded bg-muted" />
          </div>
        </Shell>
      </div>
    );
  }

  if (round.phase === 'error' || round.phase === 'empty') {
    return (
      <div className="py-6">
        <Shell>
          <p className="py-4 text-center text-sm text-muted-foreground">
            {round.phase === 'error' ? t('loadFailed') : t('nothingDue')}
          </p>
          <div className="flex justify-center gap-2">
            {round.phase === 'error' && (
              <Button variant="secondary" onClick={() => void start()}>
                {t('retry')}
              </Button>
            )}
            {back}
          </div>
        </Shell>
      </div>
    );
  }

  if (round.phase === 'complete') {
    const summary = summarizeRound(round);
    const next = formatDue(summary.nextDue);
    return (
      <div className="py-6" data-testid="word-review-summary">
        <Shell>
          <h2 className="mb-3 text-base font-semibold text-foreground">{t('complete')}</h2>
          <p className="text-sm text-foreground">{t('answered', { count: summary.answered })}</p>
          {summary.retried > 0 && (
            <p className="text-sm text-muted-foreground">
              {t('retried', { count: summary.retried })}
            </p>
          )}
          {summary.changed.length > 0 && (
            <ul className="mt-4 space-y-2" data-testid="stage-changes">
              {summary.changed.map((change) => (
                <li key={change.cardId} className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-foreground">{change.word}</span>
                  <StageBadge stage={change.from} />
                  <span aria-hidden className="text-muted-foreground">
                    →
                  </span>
                  <StageBadge stage={change.to} />
                </li>
              ))}
            </ul>
          )}
          {next && (
            <p className="mt-4 text-xs text-muted-foreground">{t('nextDue', { time: next })}</p>
          )}
          <div className="mt-5 flex items-center justify-between">
            {back}
            {wasWrong}
          </div>
        </Shell>
      </div>
    );
  }

  if (!current || !questionType) return null;

  const locked = round.phase === 'feedback';
  const feedback = round.feedback;
  const submit = (raw: Parameters<typeof answer>[1]) => answer(current, raw, questionType);
  const left = round.queue.length + round.retryQueue.length;
  const card = `${current.cardId}:${round.step}`;
  const shown = current.example
    ? {
        text: current.example.text,
        source: current.example.source,
        translation: current.example.translation,
      }
    : {
        text: current.sentence,
        source: current.sentenceSource,
        translation: current.sentenceTranslation,
      };

  return (
    <div className="py-6" data-testid="word-review-round">
      <div className="mb-4 flex items-center justify-between">
        {back}
        <span className="text-xs text-muted-foreground">{t('left', { count: left })}</span>
      </div>
      <Shell>
        {questionType === 'choose_meaning' && (
          <ChooseMeaning key={card} item={current} locked={locked} onAnswer={submit} />
        )}
        {questionType === 'recognition' && (
          <RecognitionCard
            key={card}
            item={current}
            locked={locked}
            showTranslation={showTranslation}
            onShowTranslation={showTranslationNow}
            onAnswer={submit}
          />
        )}
        {questionType === 'fill_in' && (
          <FillIn
            key={card}
            item={current}
            roundItems={roundItems}
            locked={locked}
            showTranslation={showTranslation}
            onShowTranslation={showTranslationNow}
            onAnswer={submit}
          />
        )}
        {questionType === 'typed_fill_in' && (
          <TypedFillIn
            key={card}
            item={current}
            locked={locked}
            showTranslation={showTranslation}
            onShowTranslation={showTranslationNow}
            onAnswer={submit}
          />
        )}
        {questionType === 'dictation' && !locked && (
          <DictationCard
            key={card}
            current={dictationCurrent(current)}
            hideMastery
            onSubmit={(typed) =>
              void submit(
                scoreDictation(diffDictation(typed, current.sentence)).isPass ? 'right' : 'wrong',
              )
            }
            onSurrender={() => void submit('wrong')}
          />
        )}

        {feedback && (
          <div className="mt-6 border-t border-border pt-4" data-testid="word-feedback">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">
                {feedback.rawAnswer === 'right'
                  ? t('correct')
                  : feedback.rawAnswer === 'wrong'
                    ? t('incorrect')
                    : feedback.word}
              </span>
              <StageBadge stage={feedback.stage} />
            </div>
            {(feedback.rawAnswer === 'right' || feedback.rawAnswer === 'wrong') && (
              <p className="mt-2 text-sm text-foreground">
                <span className="font-medium">{feedback.word}</span>
                {current.translation && (
                  <span className="text-muted-foreground"> — {current.translation}</span>
                )}
              </p>
            )}
            {shown.text && (
              <>
                <p className="mt-2 text-sm text-muted-foreground">{shown.text}</p>
                <SourceLine source={shown.source} className="mt-1" />
                <SentenceTranslation
                  text={shown.translation?.text}
                  show={showTranslation}
                  onShow={showTranslationNow}
                  className="mt-1"
                />
              </>
            )}
            <Button className="mt-4 w-full" onClick={advance} data-testid="word-next">
              {t('next')}
              <Kbd>Enter</Kbd>
            </Button>
          </div>
        )}
      </Shell>
      {!locked && <div className="mt-2 flex justify-end">{wasWrong}</div>}
    </div>
  );
}
