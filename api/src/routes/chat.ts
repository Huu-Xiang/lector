import { Hono } from 'hono';
import { db, ChatMessageRow } from '../db';
import { getProvider } from '../lib/llm';
import { getCurrentUserId } from '../lib/user';
import { resolveLanguage } from '../lib/active-language';
import { getNativeLanguageName, isMonolingualExplanationsEnabled } from '../lib/native-language';
import { getLanguageConfig } from '../lib/languages';
import { entitlements, planLimitResponse, type UsageReservation } from '../lib/entitlements';
import { getSystemPrompt, withSystemPrompt, type ChatTurn } from '../lib/chat-prompt';
import { randomUUID } from 'crypto';

const app = new Hono();

const MAX_CONTEXT_MESSAGES = 20;
const TTL_DAYS = 7;
export const MAX_CHAT_MESSAGE_BYTES = 8 * 1024;

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function cleanExpired() {
  db.prepare(
    `DELETE FROM chat_messages WHERE createdAt < datetime('now', '-${TTL_DAYS} days')`,
  ).run();
}

// GET /api/chat — fetch message history
app.get('/', (c) => {
  cleanExpired();

  const userId = getCurrentUserId(c);
  const limit = parseInt(c.req.query('limit') || '50');
  const before = c.req.query('before'); // cursor for infinite scroll
  const lang = resolveLanguage(c.req.query('language'), userId);

  let messages: ChatMessageRow[];

  if (before) {
    messages = db
      .prepare(
        'SELECT * FROM chat_messages WHERE userId = ? AND createdAt < ? AND language = ? ORDER BY createdAt DESC LIMIT ?',
      )
      .all(userId, before, lang, limit) as ChatMessageRow[];
  } else {
    messages = db
      .prepare(
        'SELECT * FROM chat_messages WHERE userId = ? AND language = ? ORDER BY createdAt DESC LIMIT ?',
      )
      .all(userId, lang, limit) as ChatMessageRow[];
  }

  return c.json(messages.reverse());
});

// POST /api/chat — send a message, get assistant response
app.post('/', async (c) => {
  const userId = getCurrentUserId(c);
  let reservation: UsageReservation | null = null;
  try {
    cleanExpired();

    const { message, language, history: clientHistory } = await c.req.json();
    const normalizedMessage = typeof message === 'string' ? message.trim() : '';

    if (!normalizedMessage) {
      return c.json({ error: 'message is required' }, 400);
    }
    if (utf8Bytes(normalizedMessage) > MAX_CHAT_MESSAGE_BYTES) {
      return c.json({ error: 'message must be at most 8 KiB' }, 413);
    }

    const persistHistory = entitlements.resolveEntitlements(userId).plan !== 'free';

    // Reserve before the provider call, refund on failure (#222 review).
    const llmVerdict = entitlements.reserve(userId, 'llmRequestsPerMonth');
    if (!llmVerdict.allowed) return planLimitResponse(c, llmVerdict);
    reservation = llmVerdict.reservation;

    const lang = resolveLanguage(language, userId);
    const langName = getLanguageConfig(lang).name;
    const monolingual = isMonolingualExplanationsEnabled(userId);
    const SYSTEM_PROMPT = getSystemPrompt(langName, getNativeLanguageName(userId), monolingual);

    const now = new Date().toISOString();
    const userMsg: ChatMessageRow = {
      id: randomUUID(),
      role: 'user',
      content: normalizedMessage,
      provider: null,
      responseId: null,
      createdAt: now,
      language: lang,
    };

    const provider = getProvider(userId, { byok: reservation.byok });

    // Send the full recent (same-language) history every turn. Paid plans load
    // from chat_messages; Free/BYOK plans (where persistHistory is false) accept
    // bounded client-provided session turns so follow-up questions keep context
    // without creating unbounded server storage.
    let priorTurns: ChatTurn[];
    if (persistHistory) {
      const recentMessages = db
        .prepare(
          'SELECT * FROM chat_messages WHERE userId = ? AND language = ? ORDER BY createdAt DESC LIMIT ?',
        )
        .all(userId, lang, MAX_CONTEXT_MESSAGES - 1) as ChatMessageRow[];
      priorTurns = recentMessages.reverse().map((m) => ({
        role: m.role,
        content: m.content,
      }));
    } else if (Array.isArray(clientHistory)) {
      // Accumulate newest-to-oldest within the byte and turn budgets so newer context
      // wins over stale early turns, then normalize to strict alternating user/assistant
      // order starting with a user turn and ending with an assistant turn (Anthropic API rule).
      const MAX_HISTORY_TOTAL_BYTES = MAX_CHAT_MESSAGE_BYTES * 4;
      const reversedAccepted: ChatTurn[] = [];
      let totalBytes = 0;
      for (let i = clientHistory.length - 1; i >= 0; i--) {
        if (reversedAccepted.length >= MAX_CONTEXT_MESSAGES - 1) break;
        const item = clientHistory[i];
        if (!item || (item.role !== 'user' && item.role !== 'assistant')) continue;
        if (typeof item.content !== 'string') continue;
        const content = item.content.trim();
        if (!content) continue;
        const size = utf8Bytes(content);
        if (size > MAX_CHAT_MESSAGE_BYTES || totalBytes + size > MAX_HISTORY_TOTAL_BYTES) continue;
        totalBytes += size;
        reversedAccepted.push({ role: item.role, content });
      }
      const chronological = reversedAccepted.reverse();
      // Drop leading assistant turns (Anthropic requires first turn to be user).
      let startIdx = 0;
      while (startIdx < chronological.length && chronological[startIdx].role !== 'user') {
        startIdx++;
      }
      // Collapse consecutive same-role turns by keeping the latest turn of each run.
      const alternating: ChatTurn[] = [];
      for (let i = startIdx; i < chronological.length; i++) {
        const turn = chronological[i];
        if (alternating.length > 0 && alternating[alternating.length - 1].role === turn.role) {
          alternating[alternating.length - 1] = turn;
        } else {
          alternating.push(turn);
        }
      }
      // Before appending the new user turn, drop any trailing unpaired user turn.
      while (alternating.length > 0 && alternating[alternating.length - 1].role === 'user') {
        alternating.pop();
      }
      priorTurns = alternating;
    } else {
      priorTurns = [];
    }

    const history: ChatTurn[] = [...priorTurns, { role: 'user', content: userMsg.content }];

    const chatHistory = withSystemPrompt(history, SYSTEM_PROMPT);

    const responseText = await provider.complete({
      messages: chatHistory,
      maxTokens: 1024,
      task: 'chat',
    });
    reservation = null; // the provider call happened — the usage is earned

    const assistantMsg: ChatMessageRow = {
      id: randomUUID(),
      role: 'assistant',
      content: responseText,
      provider: provider.name,
      responseId: null,
      createdAt: new Date().toISOString(),
      language: lang,
    };

    // Free chat is deliberately response-only, including with BYOK: it must not
    // become an unbounded storage path outside learner-data takeout. Paid chat
    // remains ephemeral (7-day TTL) and is intentionally excluded from takeout.
    if (persistHistory) {
      const insertMsg = db.prepare(
        'INSERT INTO chat_messages (id, role, content, provider, responseId, createdAt, language, userId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      );
      insertMsg.run(
        userMsg.id,
        userMsg.role,
        userMsg.content,
        userMsg.provider,
        userMsg.responseId,
        userMsg.createdAt,
        lang,
        userId,
      );
      insertMsg.run(
        assistantMsg.id,
        assistantMsg.role,
        assistantMsg.content,
        assistantMsg.provider,
        assistantMsg.responseId,
        assistantMsg.createdAt,
        lang,
        userId,
      );
    }

    return c.json({ userMessage: userMsg, assistantMessage: assistantMsg });
  } catch (error) {
    if (reservation) entitlements.refund(reservation);
    console.error('Chat error:', error);
    return c.json({ error: 'Failed to get response' }, 500);
  }
});

// DELETE /api/chat — clear chat history for the active (or requested) language
app.delete('/', (c) => {
  const userId = getCurrentUserId(c);
  const lang = resolveLanguage(c.req.query('language'), userId);
  db.prepare('DELETE FROM chat_messages WHERE userId = ? AND language = ?').run(userId, lang);
  return c.json({ ok: true });
});

export default app;
