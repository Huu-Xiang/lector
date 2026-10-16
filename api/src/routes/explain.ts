import { Hono } from 'hono';
import { getProvider } from '../lib/llm';
import { resolveLanguage } from '../lib/active-language';
import { getCurrentUserId } from '../lib/user';
import { getLanguageConfig } from '../lib/languages';
import { getNativeLanguageName } from '../lib/native-language';
import { buildExplainPrompt } from '../lib/translate-prompts';
import { entitlements, planLimitResponse, type UsageReservation } from '../lib/entitlements';

const app = new Hono();

// POST /api/explain
app.post('/', async (c) => {
  const userId = getCurrentUserId(c);
  let reservation: UsageReservation | null = null;
  try {
    const { sentence, translation, clozeWord, language } = await c.req.json();

    if (!sentence || !translation) {
      return c.json({ error: 'sentence and translation are required' }, 400);
    }

    // Reserve BEFORE the provider call, refund on failure (#222 review): a
    // check-then-record leaves a window where concurrent requests both pass.
    const llmVerdict = entitlements.reserve(userId, 'llmRequestsPerMonth');
    if (!llmVerdict.allowed) return planLimitResponse(c, llmVerdict);
    reservation = llmVerdict.reservation;

    const lang = resolveLanguage(language, userId);
    const langName = getLanguageConfig(lang).name;
    const nativeName = getNativeLanguageName(userId);

    const provider = getProvider(userId, { byok: reservation.byok });
    const text = await provider.complete({
      messages: [
        {
          role: 'user',
          content: buildExplainPrompt({ langName, nativeName, sentence, translation, clozeWord }),
        },
      ],
      maxTokens: 1024,
    });

    reservation = null; // the provider call happened — the usage is earned
    return c.json({ explanation: text });
  } catch (error) {
    if (reservation) entitlements.refund(reservation);
    console.error('Error generating explanation:', error);
    return c.json({ error: 'Failed to generate explanation' }, 500);
  }
});

export default app;
