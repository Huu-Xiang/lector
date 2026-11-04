import { Hono, type Context } from 'hono';
import { resolveLanguage } from '../lib/active-language';
import { entitlements, planLimitResponse } from '../lib/entitlements';
import { getProvider } from '../lib/llm';
import { localizeDailyLimiter, translationBurstLimiter } from '../lib/rate-limit';
import { sharedExampleSentenceCache } from '../lib/example-sentence-cache';
import { sharedSentenceTranslationCache } from '../lib/sentence-translation-cache';
import { getNativeLanguageCode } from '../lib/native-language';
import { db } from '../db';
import {
  AnswerError,
  QUESTION_TYPES,
  RAW_ANSWERS,
  StatsLimitError,
  defaultLogRowLimit,
  submitAnswer,
  submitUndo,
  type AnswerDeps,
} from '../lib/review/answer';
import {
  DEFAULT_ROUND_SIZE,
  MAX_ROUND_SIZE,
  buildRound,
  getCounts,
  readLearnerLevel,
} from '../lib/review/queue';
import {
  AI_SENTENCE_KEY,
  cachedExample,
  exampleAsFound,
  generateExample,
  sentenceTranslationFor,
  translateSentence,
  type SentenceAiDeps,
} from '../lib/review/sentence-ai';
import {
  findSentence,
  findSentenceByKey,
  type SentenceDeps,
  type SentenceRequest,
} from '../lib/review/sentence-sources';
import type { WordCardRow } from '../lib/review/word-card-rows';
import { backfillWordCards } from '../lib/review/backfill';
import { reconcileWordCards } from '../lib/review/reconcile';
import { createScheduler } from '../lib/review/scheduler';
import { getCurrentUserId } from '../lib/user';

export interface ReviewRouteDeps extends Partial<AnswerDeps> {
  now?: () => number;
  /** Provider, limiters and shared caches for sentence translations and AI examples. */
  ai?: Partial<SentenceAiDeps>;
  /** Sentence sources; replaced in tests. */
  sentenceDeps?: SentenceDeps;
}

const SAVED_KEY = 'saved';

const MAX_ID_LENGTH = 128;

function idOf(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH
    ? value
    : null;
}

export function makeReviewRoutes({
  now = Date.now,
  scheduler = createScheduler(),
  logRowLimit = defaultLogRowLimit,
  ai,
  sentenceDeps,
}: ReviewRouteDeps = {}): Hono {
  const app = new Hono();
  const deps: AnswerDeps = { scheduler, logRowLimit };
  const aiDeps: SentenceAiDeps = {
    providerForUser: getProvider,
    engine: entitlements,
    rateLimiter: translationBurstLimiter,
    dailyLimiter: localizeDailyLimiter,
    translations: sharedSentenceTranslationCache,
    examples: sharedExampleSentenceCache,
    ...ai,
    sentenceDeps: ai?.sentenceDeps ?? sentenceDeps,
  };
  const finder = (request: SentenceRequest) => findSentence(request, sentenceDeps);

  function prepare(userId: string, language: string) {
    const at = now();
    backfillWordCards(userId, language, at);
    reconcileWordCards(userId, language, at);
    return at;
  }

  app.get('/counts', (c) => {
    const userId = getCurrentUserId(c);
    const language = resolveLanguage(c.req.query('language'), userId);
    return c.json(getCounts(userId, language, prepare(userId, language)));
  });

  app.get('/queue', (c) => {
    const userId = getCurrentUserId(c);
    const language = resolveLanguage(c.req.query('language'), userId);
    const requested = Number.parseInt(c.req.query('limit') ?? '', 10);
    const size = Number.isFinite(requested)
      ? Math.min(MAX_ROUND_SIZE, Math.max(1, requested))
      : DEFAULT_ROUND_SIZE;
    return c.json(
      buildRound(userId, language, size, prepare(userId, language), undefined, finder, {
        translations: aiDeps.translations,
        examples: aiDeps.examples,
        forms: sentenceDeps?.forms,
      }),
    );
  });

  interface ServedCard {
    card: WordCardRow & { text: string; sentence: string };
    request: SentenceRequest;
  }

  /** The card of a round the learner was served, with the request that finds its sentences. */
  async function servedCard(userId: string, c: Context): Promise<ServedCard | Response> {
    const body = await c.req.json().catch(() => null);
    const roundId = idOf(body?.roundId);
    const cardId = idOf(body?.cardId);
    if (!roundId || !cardId) return c.json({ error: 'roundId and cardId are required' }, 400);
    const round = db
      .prepare('SELECT cardIds FROM reviewRounds WHERE userId = ? AND id = ?')
      .get(userId, roundId) as { cardIds: string } | undefined;
    if (!round || !(JSON.parse(round.cardIds) as string[]).includes(cardId)) {
      return c.json({ error: 'The card was not served in this round' }, 400);
    }
    const card = db
      .prepare(
        `SELECT c.*, v.text, v.sentence FROM wordCards c
           JOIN vocab v ON v.id = c.vocabId AND v.userId = c.userId
          WHERE c.userId = ? AND c.id = ? AND c.retiredAt IS NULL`,
      )
      .get(userId, cardId) as ServedCard['card'] | undefined;
    if (!card) return c.json({ error: 'Card not found' }, 404);
    return {
      card,
      request: {
        word: card.text,
        type: card.type,
        language: card.language,
        level: readLearnerLevel(userId, card.language),
        savedSentence: card.sentence,
        lastSentenceKey: card.lastSentenceKey,
      },
    };
  }

  // Translates the sentence last served for a card. The server finds the sentence from
  // its key, so a caller cannot send text of its own, and the saved sentence is never sent.
  app.post('/sentence-translation', async (c) => {
    const userId = getCurrentUserId(c);
    const served = await servedCard(userId, c);
    if (served instanceof Response) return served;
    const { card, request } = served;
    const key = card.lastSentenceKey;
    if (!key || key === SAVED_KEY) return c.json({ translation: null });
    const text =
      key === AI_SENTENCE_KEY
        ? (aiDeps.examples.get(card.language, card.text)?.sentence ?? null)
        : (findSentenceByKey(request, key, sentenceDeps)?.text ?? null);
    if (text === null) return c.json({ translation: null });
    const native = getNativeLanguageCode(userId);
    return c.json({
      translation: await translateSentence(aiDeps, userId, card.language, native, text),
    });
  });

  // An AI example for a fill-in card whose only sentence is the saved one. It is
  // refused while a library or Tatoeba sentence exists.
  app.post('/example-sentence', async (c) => {
    const userId = getCurrentUserId(c);
    const served = await servedCard(userId, c);
    if (served instanceof Response) return served;
    const { card, request } = served;
    const noSentence = c.json({ sentence: null });
    if (card.lastSentenceKey !== SAVED_KEY) return noSentence;
    const other = finder({ ...request, lastSentenceKey: SAVED_KEY });
    if (other && other.source.kind !== 'saved') return noSentence;
    const example = await generateExample(aiDeps, userId, request);
    if (!example) return noSentence;
    db.prepare('UPDATE wordCards SET lastSentenceKey = ? WHERE userId = ? AND id = ?').run(
      AI_SENTENCE_KEY,
      userId,
      card.id,
    );
    const found = exampleAsFound(example);
    const { translation, pending } = sentenceTranslationFor(
      found,
      card.language,
      getNativeLanguageCode(userId),
      aiDeps.translations,
    );
    return c.json({
      sentence: {
        text: found.text,
        blank: found.blank,
        source: found.source,
        ...(translation ? { translation } : {}),
      },
      ...(pending ? { translationPending: true } : {}),
    });
  });

  function failure(c: Parameters<typeof planLimitResponse>[0], error: unknown) {
    if (error instanceof AnswerError) return c.json({ error: error.message }, error.status);
    if (error instanceof StatsLimitError) return planLimitResponse(c, error.verdict);
    throw error;
  }

  app.post('/answer', async (c) => {
    const userId = getCurrentUserId(c);
    const body = await c.req.json().catch(() => null);
    const roundId = idOf(body?.roundId);
    const eventId = idOf(body?.eventId);
    const cardId = idOf(body?.cardId);
    if (
      !roundId ||
      !eventId ||
      !cardId ||
      !RAW_ANSWERS.includes(body.rawAnswer) ||
      !QUESTION_TYPES.includes(body.questionType)
    ) {
      return c.json(
        { error: 'roundId, eventId, cardId, rawAnswer and questionType are required' },
        400,
      );
    }
    try {
      const input = {
        roundId,
        eventId,
        cardId,
        rawAnswer: body.rawAnswer,
        questionType: body.questionType,
      };
      return c.json(submitAnswer(deps, userId, input, now()));
    } catch (error) {
      return failure(c, error);
    }
  });

  app.post('/undo', async (c) => {
    const userId = getCurrentUserId(c);
    const body = await c.req.json().catch(() => null);
    const roundId = idOf(body?.roundId);
    const eventId = idOf(body?.eventId);
    const newEventId = idOf(body?.newEventId);
    if (!roundId || !eventId || !newEventId) {
      return c.json({ error: 'roundId, eventId and newEventId are required' }, 400);
    }
    try {
      return c.json(submitUndo(deps, userId, { roundId, eventId, newEventId }, now()));
    } catch (error) {
      return failure(c, error);
    }
  });

  return app;
}

export default makeReviewRoutes();
