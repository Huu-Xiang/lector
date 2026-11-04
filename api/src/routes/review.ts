import { Hono } from 'hono';
import { resolveLanguage } from '../lib/active-language';
import { planLimitResponse } from '../lib/entitlements';
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
import { DEFAULT_ROUND_SIZE, MAX_ROUND_SIZE, buildRound, getCounts } from '../lib/review/queue';
import { backfillWordCards } from '../lib/review/backfill';
import { reconcileWordCards } from '../lib/review/reconcile';
import { createScheduler } from '../lib/review/scheduler';
import { getCurrentUserId } from '../lib/user';

export interface ReviewRouteDeps extends Partial<AnswerDeps> {
  now?: () => number;
}

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
}: ReviewRouteDeps = {}): Hono {
  const app = new Hono();
  const deps: AnswerDeps = { scheduler, logRowLimit };

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
    return c.json(buildRound(userId, language, size, prepare(userId, language)));
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
