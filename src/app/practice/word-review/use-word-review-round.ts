import { useCallback, useReducer, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  getReviewExampleSentence,
  getReviewQueue,
  getReviewSentenceTranslation,
  submitReviewAnswer,
  undoReviewAnswer,
} from '@/lib/data-layer';
import { applyCardPatch, resolveLazySentence, type CardPatch } from './lazy-sentence';
import { playCorrectSound, playIncorrectSound } from '@/lib/sounds';
import type {
  ReviewAnswerResult,
  ReviewItem,
  ReviewQuestionType,
  ReviewRawAnswer,
  WordStage,
} from '@/types';

export type WordRoundPhase =
  | 'idle'
  | 'loading'
  | 'practicing'
  | 'feedback'
  | 'complete'
  | 'empty'
  | 'error';

export interface PendingKnow {
  cardId: string;
  eventId: string;
  word: string;
}

export interface WordFeedback {
  cardId: string;
  word: string;
  rawAnswer: ReviewRawAnswer;
  previousStage: WordStage;
  stage: WordStage;
}

export interface WordRoundState {
  phase: WordRoundPhase;
  roundId: string;
  queue: ReviewItem[];
  retryQueue: ReviewItem[];
  step: number;
  items: Record<string, ReviewItem>;
  firstStage: Record<string, WordStage>;
  finalStage: Record<string, WordStage>;
  dueByCard: Record<string, string>;
  answered: string[];
  requeued: string[];
  pendingKnow: PendingKnow | null;
  feedback: WordFeedback | null;
}

export type WordRoundAction =
  | { type: 'begin' }
  | { type: 'loaded'; roundId: string; items: ReviewItem[] }
  | { type: 'load-failed' }
  | {
      type: 'answered';
      item: ReviewItem;
      eventId: string;
      rawAnswer: ReviewRawAnswer;
      result: ReviewAnswerResult;
    }
  | { type: 'undone'; result: ReviewAnswerResult }
  | { type: 'card-patched'; cardId: string; patch: CardPatch }
  | { type: 'advance' };

export function createInitialWordRound(): WordRoundState {
  return {
    phase: 'idle',
    roundId: '',
    queue: [],
    retryQueue: [],
    step: 0,
    items: {},
    firstStage: {},
    finalStage: {},
    dueByCard: {},
    answered: [],
    requeued: [],
    pendingKnow: null,
    feedback: null,
  };
}

function advanceRound(state: WordRoundState): WordRoundState {
  const base = { ...state, feedback: null, step: state.step + 1 };
  const remaining = state.queue.slice(1);
  if (remaining.length > 0) return { ...base, phase: 'practicing', queue: remaining };
  if (state.retryQueue.length > 0) {
    return { ...base, phase: 'practicing', queue: state.retryQueue, retryQueue: [] };
  }
  return { ...base, phase: 'complete', queue: [] };
}

function withRequeue(state: WordRoundState, item: ReviewItem | undefined, requeue: boolean) {
  if (!requeue || !item || state.requeued.includes(item.cardId)) return state;
  return {
    ...state,
    retryQueue: [...state.retryQueue, item],
    requeued: [...state.requeued, item.cardId],
  };
}

export function wordRoundReducer(state: WordRoundState, action: WordRoundAction): WordRoundState {
  switch (action.type) {
    case 'begin':
      return { ...createInitialWordRound(), phase: 'loading' };
    case 'load-failed':
      return { ...state, phase: 'error' };
    case 'loaded':
      return {
        ...createInitialWordRound(),
        phase: action.items.length > 0 ? 'practicing' : 'empty',
        roundId: action.roundId,
        queue: action.items,
        items: Object.fromEntries(action.items.map((i) => [i.cardId, i])),
      };
    case 'answered': {
      const { item, result, rawAnswer, eventId } = action;
      const previousStage = state.finalStage[item.cardId] ?? item.stage;
      let next: WordRoundState = {
        ...state,
        firstStage: {
          ...state.firstStage,
          [item.cardId]: state.firstStage[item.cardId] ?? item.stage,
        },
        finalStage: { ...state.finalStage, [item.cardId]: result.stage },
        dueByCard: { ...state.dueByCard, [item.cardId]: result.due },
        answered: state.answered.includes(item.cardId)
          ? state.answered
          : [...state.answered, item.cardId],
        pendingKnow:
          rawAnswer === 'know' ? { cardId: item.cardId, eventId, word: item.word } : null,
      };
      next = withRequeue(next, item, result.requeue);
      if (rawAnswer === 'know') return advanceRound(next);
      return {
        ...next,
        phase: 'feedback',
        feedback: {
          cardId: item.cardId,
          word: item.word,
          rawAnswer,
          previousStage,
          stage: result.stage,
        },
      };
    }
    case 'undone': {
      const { result } = action;
      let next: WordRoundState = {
        ...state,
        finalStage: { ...state.finalStage, [result.cardId]: result.stage },
        dueByCard: { ...state.dueByCard, [result.cardId]: result.due },
        pendingKnow: null,
      };
      next = withRequeue(next, state.items[result.cardId], result.requeue);
      if (next.phase === 'complete' && next.retryQueue.length > 0) {
        return {
          ...next,
          phase: 'practicing',
          queue: next.retryQueue,
          retryQueue: [],
          step: next.step + 1,
        };
      }
      return next;
    }
    case 'card-patched': {
      const { cardId, patch } = action;
      const update = (item: ReviewItem) =>
        item.cardId === cardId ? applyCardPatch(item, patch) : item;
      const known = state.items[cardId];
      return {
        ...state,
        queue: state.queue.map(update),
        retryQueue: state.retryQueue.map(update),
        items: known ? { ...state.items, [cardId]: applyCardPatch(known, patch) } : state.items,
      };
    }
    case 'advance':
      return advanceRound(state);
  }
}

export interface StageChange {
  cardId: string;
  word: string;
  from: WordStage;
  to: WordStage;
}

export interface RoundSummary {
  answered: number;
  retried: number;
  changed: StageChange[];
  nextDue: string | null;
}

export function summarizeRound(state: WordRoundState): RoundSummary {
  const changed: StageChange[] = [];
  for (const cardId of state.answered) {
    const from = state.firstStage[cardId];
    const to = state.finalStage[cardId];
    if (from && to && from !== to)
      changed.push({ cardId, word: state.items[cardId].word, from, to });
  }
  const dues = Object.values(state.dueByCard).sort();
  return {
    answered: state.answered.length,
    retried: state.requeued.length,
    changed,
    nextDue: dues[0] ?? null,
  };
}

export function useWordReviewRound() {
  const t = useTranslations('practice.words');
  const [round, dispatch] = useReducer(wordRoundReducer, undefined, createInitialWordRound);
  const busy = useRef(false);
  const requested = useRef(new Set<string>());
  const pendingEvents = useRef(new Map<string, string>());

  const start = useCallback(
    async function load(size = 20) {
      dispatch({ type: 'begin' });
      requested.current.clear();
      pendingEvents.current.clear();
      try {
        const queue = await getReviewQueue(size);
        dispatch({ type: 'loaded', roundId: queue.roundId, items: queue.items });
      } catch {
        dispatch({ type: 'load-failed' });
        toast.error(t('loadFailed'), {
          action: { label: t('retry'), onClick: () => void load(size) },
        });
      }
    },
    [t],
  );

  const answer = useCallback(
    async (item: ReviewItem, rawAnswer: ReviewRawAnswer, questionType: ReviewQuestionType) => {
      if (busy.current) return false;
      busy.current = true;
      const eventKey = `${round.roundId}:${item.cardId}:${rawAnswer}:${questionType}`;
      const eventId = pendingEvents.current.get(eventKey) ?? crypto.randomUUID();
      pendingEvents.current.set(eventKey, eventId);
      try {
        const result = await submitReviewAnswer({
          roundId: round.roundId,
          eventId,
          cardId: item.cardId,
          rawAnswer,
          questionType,
        });
        if (rawAnswer === 'right') playCorrectSound();
        if (rawAnswer === 'wrong') playIncorrectSound();
        pendingEvents.current.delete(eventKey);
        dispatch({ type: 'answered', item, eventId, rawAnswer, result });
        return true;
      } catch {
        toast.error(t('saveFailed'));
        return false;
      } finally {
        busy.current = false;
      }
    },
    [round.roundId, t],
  );

  const undoKnow = useCallback(async () => {
    const pending = round.pendingKnow;
    if (!pending || busy.current) return false;
    busy.current = true;
    try {
      const result = await undoReviewAnswer({
        roundId: round.roundId,
        eventId: pending.eventId,
        newEventId: crypto.randomUUID(),
      });
      dispatch({ type: 'undone', result });
      return true;
    } catch {
      toast.error(t('undoFailed'));
      return false;
    } finally {
      busy.current = false;
    }
  }, [round.roundId, round.pendingKnow, t]);

  const advance = useCallback(() => dispatch({ type: 'advance' }), []);

  const loadSentence = useCallback(
    (item: ReviewItem) => {
      const roundId = round.roundId;
      void resolveLazySentence(
        item,
        requested.current,
        {
          example: (cardId) => getReviewExampleSentence({ roundId, cardId }),
          translation: (cardId) => getReviewSentenceTranslation({ roundId, cardId }),
        },
        (patch) => dispatch({ type: 'card-patched', cardId: item.cardId, patch }),
      );
    },
    [round.roundId],
  );

  return { round, start, answer, undoKnow, advance, loadSentence };
}
