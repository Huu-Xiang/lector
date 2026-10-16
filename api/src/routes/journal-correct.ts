import { Hono } from 'hono';
import { correctJournalText } from '../lib/journal-correct';
import { getCurrentUserId } from '../lib/user';
import { providerAnswered } from '../lib/llm';
import { entitlements, planLimitResponse, type UsageReservation } from '../lib/entitlements';

const MAX_JOURNAL_CHARS = 8000;

const app = new Hono();

// POST /api/journal-correct — correct a piece of text (no persistence). Metered
// as a managed-LLM request (#222), exactly like /api/journal/:id/correct:
// reserved before the provider call and refunded if it fails, so this
// standalone endpoint can't be an unmetered path into the managed provider
// (#222 review — it previously bypassed the allowance entirely).
app.post('/', async (c) => {
  const userId = getCurrentUserId(c);
  let reservation: UsageReservation | null = null;
  try {
    const { body, language } = await c.req.json();

    if (typeof body !== 'string' || !body.trim()) {
      return c.json({ error: 'body is required' }, 400);
    }
    if (body.length > MAX_JOURNAL_CHARS) {
      return c.json({ error: 'body is too long' }, 413);
    }

    const llmVerdict = entitlements.reserve(userId, 'llmRequestsPerMonth');
    if (!llmVerdict.allowed) return planLimitResponse(c, llmVerdict);
    reservation = llmVerdict.reservation;

    const result = await correctJournalText(userId, body, language, {
      byok: reservation.byok,
    });
    reservation = null; // the provider call happened — the usage is earned
    return c.json(result);
  } catch (error) {
    if (reservation && !providerAnswered(error)) entitlements.refund(reservation);
    console.error('Journal correction error:', error);
    return c.json({ error: 'Correction failed' }, 500);
  }
});

export default app;
