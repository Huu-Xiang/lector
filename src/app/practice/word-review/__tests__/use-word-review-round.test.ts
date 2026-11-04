import { describe, expect, it } from 'vitest';
import type { ReviewAnswerResult, ReviewItem } from '@/types';
import {
  createInitialWordRound,
  summarizeRound,
  wordRoundReducer,
  type WordRoundAction,
  type WordRoundState,
} from '../use-word-review-round';
import {
  buildFillInQuestion,
  effectiveQuestionType,
  recognitionKeyAction,
  shouldIgnoreKey,
} from '../questions';

function item(word: string, over: Partial<ReviewItem> = {}): ReviewItem {
  return {
    cardId: `card-${word}`,
    word,
    type: 'word',
    stage: 'learning',
    questionType: 'recognition',
    sentence: `I saw the ${word} yesterday.`,
    translation: `meaning of ${word}`,
    ...over,
  };
}

function result(i: ReviewItem, over: Partial<ReviewAnswerResult> = {}): ReviewAnswerResult {
  return {
    cardId: i.cardId,
    eventId: 'e',
    stage: i.stage,
    due: '2026-11-05T00:00:00Z',
    requeue: false,
    ...over,
  };
}

function run(state: WordRoundState, ...actions: WordRoundAction[]): WordRoundState {
  return actions.reduce(wordRoundReducer, state);
}

function started(items: ReviewItem[]): WordRoundState {
  return run(createInitialWordRound(), { type: 'begin' }, { type: 'loaded', roundId: 'r1', items });
}

describe('round flow', () => {
  it('shows each card, requeues a wrong answer once, then completes', () => {
    const [a, b, c] = [item('a'), item('b'), item('c')];
    let s = started([a, b, c]);
    expect(s.phase).toBe('practicing');
    expect(s.queue[0]).toBe(a);

    s = run(s, {
      type: 'answered',
      item: a,
      eventId: 'e1',
      rawAnswer: 'wrong',
      result: result(a, { requeue: true }),
    });
    expect(s.phase).toBe('feedback');
    s = run(s, { type: 'advance' });
    s = run(
      s,
      { type: 'answered', item: b, eventId: 'e2', rawAnswer: 'right', result: result(b) },
      { type: 'advance' },
    );
    s = run(
      s,
      { type: 'answered', item: c, eventId: 'e3', rawAnswer: 'right', result: result(c) },
      { type: 'advance' },
    );
    expect(s.phase).toBe('practicing');
    expect(s.queue.map((i) => i.word)).toEqual(['a']);

    s = run(
      s,
      { type: 'answered', item: a, eventId: 'e4', rawAnswer: 'right', result: result(a) },
      { type: 'advance' },
    );
    expect(s.phase).toBe('complete');
    expect(summarizeRound(s).answered).toBe(3);
    expect(summarizeRound(s).retried).toBe(1);
  });

  it('is empty when the queue has no items and errors on a failed load', () => {
    expect(started([]).phase).toBe('empty');
    expect(run(createInitialWordRound(), { type: 'begin' }, { type: 'load-failed' }).phase).toBe(
      'error',
    );
  });

  it('skips feedback after Know and shows the next card at once', () => {
    const [a, b] = [item('a'), item('b')];
    const s = run(started([a, b]), {
      type: 'answered',
      item: a,
      eventId: 'e1',
      rawAnswer: 'know',
      result: result(a, { stage: 'familiar' }),
    });
    expect(s.phase).toBe('practicing');
    expect(s.queue[0]).toBe(b);
    expect(s.pendingKnow).toEqual({ cardId: a.cardId, eventId: 'e1', word: 'a' });
  });
});

describe('I was wrong (AE2)', () => {
  it('offers the undo only until the next card is answered', () => {
    const [a, b, c] = [item('a'), item('b'), item('c')];
    let s = run(started([a, b, c]), {
      type: 'answered',
      item: a,
      eventId: 'e1',
      rawAnswer: 'know',
      result: result(a),
    });
    expect(s.pendingKnow?.cardId).toBe(a.cardId);
    s = run(s, {
      type: 'answered',
      item: b,
      eventId: 'e2',
      rawAnswer: 'dont_know',
      result: result(b, { requeue: true }),
    });
    expect(s.pendingKnow).toBeNull();
  });

  it('requeues the card and counts it as retried', () => {
    const [a, b] = [item('a'), item('b')];
    let s = run(started([a, b]), {
      type: 'answered',
      item: a,
      eventId: 'e1',
      rawAnswer: 'know',
      result: result(a, { stage: 'familiar' }),
    });
    s = run(s, {
      type: 'undone',
      result: result(a, { eventId: 'e2', stage: 'learning', requeue: true }),
    });
    expect(s.pendingKnow).toBeNull();
    s = run(s, { type: 'answered', item: b, eventId: 'e3', rawAnswer: 'know', result: result(b) });
    expect(s.phase).toBe('practicing');
    expect(s.queue.map((i) => i.word)).toEqual(['a']);
    expect(summarizeRound(s).retried).toBe(1);
  });

  it('resumes the round when the undo happens on the summary', () => {
    const a = item('a');
    let s = run(started([a]), {
      type: 'answered',
      item: a,
      eventId: 'e1',
      rawAnswer: 'know',
      result: result(a),
    });
    expect(s.phase).toBe('complete');
    expect(s.pendingKnow?.cardId).toBe(a.cardId);
    s = run(s, { type: 'undone', result: result(a, { eventId: 'e2', requeue: true }) });
    expect(s.phase).toBe('practicing');
    expect(s.queue.map((i) => i.word)).toEqual(['a']);
  });
});

describe('summary', () => {
  it('lists only cards whose stage changed', () => {
    const [a, b] = [item('a', { stage: 'new' }), item('b', { stage: 'familiar' })];
    const s = run(
      started([a, b]),
      {
        type: 'answered',
        item: a,
        eventId: 'e1',
        rawAnswer: 'right',
        result: result(a, { stage: 'learning' }),
      },
      { type: 'advance' },
      {
        type: 'answered',
        item: b,
        eventId: 'e2',
        rawAnswer: 'right',
        result: result(b, { stage: 'familiar' }),
      },
      { type: 'advance' },
    );
    const summary = summarizeRound(s);
    expect(summary.changed).toEqual([{ cardId: a.cardId, word: 'a', from: 'new', to: 'learning' }]);
    expect(summary.answered).toBe(2);
  });

  it('compares against the first stage when a card returns', () => {
    const a = item('a', { stage: 'familiar' });
    let s = started([a]);
    s = run(
      s,
      {
        type: 'answered',
        item: a,
        eventId: 'e1',
        rawAnswer: 'wrong',
        result: result(a, { stage: 'learning', requeue: true }),
      },
      { type: 'advance' },
    );
    s = run(
      s,
      {
        type: 'answered',
        item: a,
        eventId: 'e2',
        rawAnswer: 'right',
        result: result(a, { stage: 'familiar' }),
      },
      { type: 'advance' },
    );
    expect(summarizeRound(s).changed).toEqual([]);
  });

  it('keeps the next due time from the latest answer', () => {
    const a = item('a');
    const s = run(started([a]), {
      type: 'answered',
      item: a,
      eventId: 'e1',
      rawAnswer: 'right',
      result: result(a, { due: '2026-11-09T00:00:00Z' }),
    });
    expect(summarizeRound(s).nextDue).toBe('2026-11-09T00:00:00Z');
  });
});

describe('question choice', () => {
  const words = ['one', 'two', 'three', 'four'].map((w) =>
    item(w, { stage: 'familiar', questionType: 'fill_in' }),
  );

  it('falls back to recognition for choose_meaning without choices', () => {
    const q = item('x', { questionType: 'choose_meaning' });
    expect(effectiveQuestionType(q, [q])).toBe('recognition');
    const withChoices = { ...q, choices: ['a', 'b', 'meaning of x', 'd'] };
    expect(effectiveQuestionType(withChoices, [withChoices])).toBe('choose_meaning');
  });

  it('keeps a phrase on recognition for fill-in types (AE6)', () => {
    const phrase = item('give up', {
      type: 'phrase',
      stage: 'familiar',
      questionType: 'fill_in',
      sentence: 'Never give up.',
    });
    expect(effectiveQuestionType(phrase, [phrase, ...words])).toBe('recognition');
  });

  it('builds four options with the word, and falls back with too few words', () => {
    const q = buildFillInQuestion(words[0], words);
    expect(q?.options).toHaveLength(4);
    expect(q?.options[q.correctIndex]).toBe('one');
    expect(q?.blanked).toBe('I saw the _____ yesterday.');
    expect(buildFillInQuestion(words[0], words.slice(0, 3))).toBeNull();
    expect(effectiveQuestionType(words[0], words.slice(0, 3))).toBe('recognition');
    expect(effectiveQuestionType(words[0], words)).toBe('fill_in');
  });

  it('falls back when the word is not in the sentence', () => {
    const odd = item('one', {
      stage: 'familiar',
      questionType: 'fill_in',
      sentence: 'Nothing here.',
    });
    expect(buildFillInQuestion(odd, [odd, ...words.slice(1)])).toBeNull();
  });

  it('keeps typed fill-in only when the word is in the sentence (AE7)', () => {
    const typed = item('one', { stage: 'familiar', questionType: 'typed_fill_in' });
    expect(effectiveQuestionType(typed, [typed])).toBe('typed_fill_in');
    const noSentence = { ...typed, sentence: '' };
    expect(effectiveQuestionType(noSentence, [noSentence])).toBe('recognition');
  });
});

describe('keyboard', () => {
  it('maps recognition keys', () => {
    expect(recognitionKeyAction(' ', false)).toBe('reveal');
    expect(recognitionKeyAction('Enter', false)).toBe('reveal');
    expect(recognitionKeyAction('1', false)).toBeNull();
    expect(recognitionKeyAction('1', true)).toBe('dont_know');
    expect(recognitionKeyAction('2', true)).toBe('fuzzy');
    expect(recognitionKeyAction('3', true)).toBe('know');
    expect(recognitionKeyAction('4', true)).toBeNull();
    expect(recognitionKeyAction(' ', true)).toBeNull();
  });

  it('ignores keys while composing, with modifiers, or inside inputs', () => {
    expect(shouldIgnoreKey({ isComposing: true, key: '3' })).toBe(true);
    expect(shouldIgnoreKey({ keyCode: 229, key: '3' })).toBe(true);
    expect(shouldIgnoreKey({ key: '3', metaKey: true })).toBe(true);
    expect(shouldIgnoreKey({ key: '3', target: { closest: () => ({}) } })).toBe(true);
    expect(shouldIgnoreKey({ key: '3', target: { closest: () => null } })).toBe(false);
  });
});
