import '../test-guard';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { randomBytes, randomUUID } from 'crypto';
import { db } from '../db';
import { authMiddleware } from '../lib/auth';
import { hashToken } from '../lib/crypto';
import type { CompletionOptions, LLMProvider } from '../lib/llm';
import { InMemoryTranslationBurstLimiter } from '../lib/rate-limit';
import type { SentenceAiDeps } from '../lib/review/sentence-ai';
import { createScheduler } from '../lib/review/scheduler';
import { makeReviewRoutes } from './review';
import review from './review';

const NOW = Date.parse('2026-11-04T12:00:00Z');
const DAY = 86_400_000;
const TS = '2026-01-01T00:00:00Z';

let clock = NOW;
let logLimit: number | null = null;

function routes() {
  return makeReviewRoutes({
    now: () => clock,
    scheduler: createScheduler({ fuzz: false }),
    logRowLimit: () => logLimit,
  });
}

let app = routes();

function clear() {
  for (const table of [
    'wordReviewLog',
    'reviewRounds',
    'wordCards',
    'knownWords',
    'vocab',
    'dailyStats',
  ]) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
  db.prepare("DELETE FROM settings WHERE key IN ('timezone','reviewGoal','targetLanguage')").run();
  db.prepare("DELETE FROM api_tokens WHERE name = 'review-test'").run();
  db.exec('DROP TRIGGER IF EXISTS temp.fail_card_update');
}

function setSetting(key: string, value: unknown) {
  db.prepare('INSERT OR REPLACE INTO settings (userId, key, value) VALUES (?, ?, ?)').run(
    'local',
    key,
    JSON.stringify(value),
  );
}

function seedVocab(
  id: string,
  text: string,
  opts: { state?: string; language?: string; type?: string; createdAt?: string } = {},
) {
  db.prepare(
    `INSERT INTO vocab (id, text, type, sentence, translation, state, stateUpdatedAt, createdAt, language)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    text,
    opts.type ?? 'word',
    `I saw the ${text} there.`,
    `meaning of ${text}`,
    opts.state ?? 'level1',
    TS,
    opts.createdAt ?? TS,
    opts.language ?? 'en',
  );
}

function seedMany(count: number, createdAt = TS, language = 'en') {
  for (let i = 0; i < count; i++) seedVocab(`m${createdAt}${i}`, `w${i}x`, { createdAt, language });
}

interface Item {
  cardId: string;
  word: string;
  type: string;
  stage: string;
  questionType: string;
  sentence: string;
  translation: string;
  choices?: string[];
}

async function getQueue(query = '') {
  const res = await app.request(`/queue?language=en${query}`);
  expect(res.status).toBe(200);
  return (await res.json()) as { roundId: string; items: Item[] };
}

async function warm(language = 'en') {
  await app.request(`/counts?language=${language}`);
}

async function post(path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

let seq = 0;
function answer(
  roundId: string,
  cardId: string,
  rawAnswer: string,
  questionType: string,
  eventId = `ev${++seq}`,
) {
  return post('/answer', { roundId, eventId, cardId, rawAnswer, questionType });
}

function stats(date = new Date(clock).toISOString().slice(0, 10)) {
  return db.prepare('SELECT * FROM dailyStats WHERE date = ?').get(date) as
    | { clozePracticed: number; points: number }
    | undefined;
}

function logRows() {
  return db.prepare('SELECT * FROM wordReviewLog ORDER BY rowid').all() as Array<{
    eventId: string;
    cardId: string;
    rating: string;
    wasRequeue: number;
    undoneAt: string | null;
    prevState: string;
  }>;
}

function cardRow(id: string) {
  return db.prepare('SELECT * FROM wordCards WHERE id = ?').get(id) as {
    state: string;
    due: string;
    stability: number;
    introducedAt: string | null;
  };
}

describe('review routes', () => {
  beforeEach(() => {
    clear();
    clock = NOW;
    logLimit = null;
    setSetting('timezone', 'UTC');
    app = routes();
  });
  afterEach(clear);

  test('AE1: 300 waiting cards give 20 new cards, and no more once those are answered', async () => {
    seedMany(300);
    const round = await getQueue('&limit=50');
    expect(round.items.filter((i) => i.questionType === 'choose_meaning')).toHaveLength(20);
    expect(round.items).toHaveLength(20);
    for (const item of round.items) {
      expect(item.choices).toHaveLength(4);
      expect(item.choices).toContain(item.translation);
    }

    for (const item of round.items) {
      expect((await answer(round.roundId, item.cardId, 'right', 'choose_meaning')).status).toBe(
        200,
      );
    }
    const counts = (await (await app.request('/counts?language=en')).json()) as {
      newAvailable: number;
    };
    expect(counts.newAvailable).toBe(0);
    const again = await getQueue('&limit=50');
    expect(again.items.filter((i) => i.stage === 'new')).toHaveLength(0);
  });

  test('AE10: a word saved today comes ahead of older waiting words', async () => {
    seedMany(30, TS);
    seedVocab('today', 'quay', { createdAt: '2026-11-04T08:00:00Z' });
    const round = await getQueue('&limit=50');
    expect(round.items[0].word).toBe('quay');
    expect(round.items).toHaveLength(20);
  });

  test('the daily cap resets at local midnight in the learner time zone', async () => {
    setSetting('timezone', 'Asia/Shanghai');
    seedMany(45);
    clock = Date.parse('2026-11-04T15:00:00Z');
    const first = await getQueue('&limit=50');
    expect(first.items).toHaveLength(20);
    for (const item of first.items)
      await answer(first.roundId, item.cardId, 'right', 'choose_meaning');
    expect((await getQueue('&limit=50')).items).toHaveLength(0);

    clock = Date.parse('2026-11-04T16:30:00Z');
    const next = await getQueue('&limit=50');
    expect(next.items).toHaveLength(20);
  });

  test('the same event id writes one log row and returns the same result', async () => {
    seedVocab('a', 'harbor');
    const round = await getQueue();
    const item = round.items[0];
    const first = await answer(round.roundId, item.cardId, 'right', 'choose_meaning', 'dup');
    const second = await answer(round.roundId, item.cardId, 'right', 'choose_meaning', 'dup');
    expect(await second.json()).toEqual(await first.json());
    expect(logRows()).toHaveLength(1);
    expect(stats()?.clozePracticed).toBe(1);
  });

  test('an answer for a card not served in the round is refused', async () => {
    seedVocab('a', 'harbor');
    seedVocab('b', 'quay');
    const round = await getQueue('&limit=1');
    const served = round.items[0].cardId;
    const other = (
      db.prepare('SELECT id FROM wordCards WHERE id != ?').get(served) as { id: string }
    ).id;
    const res = await answer(round.roundId, other, 'right', 'choose_meaning');
    expect(res.status).toBe(400);
    expect(logRows()).toHaveLength(0);
    expect((await answer('nope', served, 'right', 'choose_meaning')).status).toBe(400);
  });

  test('an answer raises clozePracticed by one and awards points by question type', async () => {
    seedVocab('a', 'harbor');
    const round = await getQueue();
    const res = await answer(round.roundId, round.items[0].cardId, 'right', 'choose_meaning');
    const body = (await res.json()) as { stage: string; due: string; requeue: boolean };
    expect(body.stage).toBe('learning');
    expect(body.requeue).toBe(false);
    expect(stats()).toMatchObject({ clozePracticed: 1, points: 4 });
    expect(cardRow(round.items[0].cardId).introducedAt).not.toBeNull();
  });

  test('a review answer writes the reader state onto every vocab row of the word', async () => {
    seedVocab('a', 'Harbor', { createdAt: '2026-01-02T00:00:00Z' });
    seedVocab('b', 'harbor', { createdAt: '2026-01-03T00:00:00Z' });
    const round = await getQueue();
    await answer(round.roundId, round.items[0].cardId, 'right', 'choose_meaning');
    const states = db.prepare('SELECT state FROM vocab').all() as Array<{ state: string }>;
    expect(states.map((s) => s.state)).toEqual(['level2', 'level2']);
  });

  test('Fuzzy and wrong earn no points; a re-ask is logged as requeue with no streak or points', async () => {
    seedVocab('a', 'harbor', { state: 'level2' });
    await warm();
    clock = NOW + 3 * DAY;
    const round = await getQueue();
    const item = round.items[0];
    expect(item.questionType).toBe('recognition');
    const first = await answer(round.roundId, item.cardId, 'dont_know', 'recognition');
    expect(((await first.json()) as { requeue: boolean }).requeue).toBe(true);
    expect(stats()).toMatchObject({ clozePracticed: 1, points: 0 });
    await answer(round.roundId, item.cardId, 'know', 'recognition');
    expect(stats()).toMatchObject({ clozePracticed: 1, points: 0 });
    expect(logRows().map((r) => r.wasRequeue)).toEqual([0, 1]);
  });

  test('AE2: Know then undo leaves one undone row and one Again row, in Learning, flagged to re-ask', async () => {
    seedVocab('a', 'fleeting', { state: 'level2' });
    await warm();
    clock = NOW + 3 * DAY;
    const round = await getQueue();
    const item = round.items[0];
    const know = await answer(round.roundId, item.cardId, 'know', 'recognition', 'k1');
    expect(stats()).toMatchObject({ clozePracticed: 1, points: 3 });
    expect(((await know.json()) as { stage: string }).stage).toBe('familiar');

    const undo = await post('/undo', { roundId: round.roundId, eventId: 'k1', newEventId: 'k2' });
    expect(undo.status).toBe(200);
    expect(await undo.json()).toMatchObject({ stage: 'learning', requeue: true });
    const rows = logRows();
    expect(rows).toHaveLength(2);
    expect(rows[0].undoneAt).not.toBeNull();
    expect(rows[1]).toMatchObject({ eventId: 'k2', rating: 'again', undoneAt: null });
    expect(cardRow(item.cardId).state).toBe('relearning');
    expect(stats()).toMatchObject({ clozePracticed: 1, points: 0 });

    const repeat = await post('/undo', { roundId: round.roundId, eventId: 'k1', newEventId: 'k2' });
    expect(repeat.status).toBe(200);
    expect(logRows()).toHaveLength(2);
  });

  test('undo of a row that is not the newest row of its card is refused', async () => {
    seedVocab('a', 'harbor', { state: 'level2' });
    await warm();
    clock = NOW + 3 * DAY;
    const round = await getQueue();
    const id = round.items[0].cardId;
    await answer(round.roundId, id, 'dont_know', 'recognition', 'e1');
    await answer(round.roundId, id, 'know', 'recognition', 'e2');
    const res = await post('/undo', { roundId: round.roundId, eventId: 'e1', newEventId: 'e3' });
    expect(res.status).toBe(409);
    expect(logRows().every((r) => r.undoneAt === null)).toBe(true);
    expect(logRows()).toHaveLength(2);
  });

  test('recognize_spell: a Familiar word asks a typed fill-in, a phrase a recognition card', async () => {
    seedVocab('a', 'harbor', { state: 'level3' });
    seedVocab('b', 'give up', { state: 'level3', type: 'phrase' });
    await warm();
    clock = NOW + 11 * DAY;
    let round = await getQueue();
    expect(Object.fromEntries(round.items.map((i) => [i.word, i.questionType]))).toEqual({
      harbor: 'fill_in',
      'give up': 'recognition',
    });
    setSetting('reviewGoal', 'recognize_spell');
    round = await getQueue();
    expect(Object.fromEntries(round.items.map((i) => [i.word, i.questionType]))).toEqual({
      harbor: 'typed_fill_in',
      'give up': 'recognition',
    });
  });

  test('a Familiar Chinese card asks a recognition card', async () => {
    seedVocab('a', '港口', { state: 'level3', language: 'zh' });
    await warm('zh');
    clock = NOW + 11 * DAY;
    const res = await app.request('/queue?language=zh');
    const body = (await res.json()) as { items: Item[] };
    expect(body.items[0]).toMatchObject({ stage: 'familiar', questionType: 'recognition' });
  });

  test('a failed card write rolls back the log row and the stats', async () => {
    seedVocab('a', 'harbor');
    const round = await getQueue();
    db.exec(
      `CREATE TEMP TRIGGER fail_card_update BEFORE UPDATE ON main.wordCards
       BEGIN SELECT RAISE(ABORT, 'card write failed'); END`,
    );
    const res = await answer(round.roundId, round.items[0].cardId, 'right', 'choose_meaning');
    expect(res.status).toBe(500);
    expect(logRows()).toHaveLength(0);
    expect(stats()).toBeNull();
  });

  test('pruning at the row limit keeps the newest row of every card', async () => {
    seedVocab('a', 'alpha');
    seedVocab('b', 'beta');
    logLimit = 3;
    const round = await getQueue();
    const [a, b] = round.items.map((i) => i.cardId);
    for (const [id, ev] of [
      [a, 'a1'],
      [a, 'a2'],
      [b, 'b1'],
      [a, 'a3'],
      [b, 'b2'],
    ]) {
      await answer(round.roundId, id, 'wrong', 'choose_meaning', ev);
    }
    const kept = logRows().map((r) => r.eventId);
    expect(kept).toHaveLength(3);
    expect(kept).toContain('a3');
    expect(kept).toContain('b2');
    expect(kept).not.toContain('a1');
  });

  test('creating a round prunes rounds older than a day', async () => {
    seedVocab('a', 'harbor');
    db.prepare(
      `INSERT INTO reviewRounds (userId, id, language, cardIds, createdAt) VALUES ('local','old','en','[]',?)`,
    ).run(new Date(NOW - 2 * DAY).toISOString());
    await getQueue();
    const ids = db.prepare('SELECT id FROM reviewRounds').all() as Array<{ id: string }>;
    expect(ids.some((r) => r.id === 'old')).toBe(false);
    expect(ids).toHaveLength(1);
  });

  test('counts report due now, new available, and the next due time', async () => {
    seedVocab('a', 'harbor', { state: 'level2' });
    seedVocab('b', 'quay');
    const res = await app.request('/counts?language=en');
    const body = (await res.json()) as { dueNow: number; newAvailable: number; nextDue: string };
    expect(body.dueNow).toBe(0);
    expect(body.newAvailable).toBe(1);
    expect(body.nextDue).toBe(new Date(NOW + 2 * DAY).toISOString());
  });
});

describe('review routes behind a personal access token', () => {
  beforeEach(clear);
  afterEach(clear);

  function token(scopes: string[]) {
    const value = `ltr_${randomBytes(32).toString('base64url')}`;
    db.prepare(
      `INSERT INTO api_tokens (id, name, tokenHash, scopes, createdAt, expiresAt, userId)
       VALUES (?, 'review-test', ?, ?, ?, NULL, 'local')`,
    ).run(randomUUID(), hashToken(value), JSON.stringify(scopes), new Date().toISOString());
    return value;
  }

  function guarded() {
    const outer = new Hono();
    outer.use('/api/*', authMiddleware);
    outer.route('/api/review', review);
    return outer;
  }

  test('a token without the vocab scope cannot reach the review routes', async () => {
    const outer = guarded();
    const headers = { Authorization: `Bearer ${token(['stats:read'])}` };
    expect((await outer.request('/api/review/counts', { headers })).status).toBe(403);
    expect((await outer.request('/api/review/queue', { headers })).status).toBe(403);
  });

  test('vocab:read reads, and vocab:write answers', async () => {
    const outer = guarded();
    const read = { Authorization: `Bearer ${token(['vocab:read'])}` };
    expect((await outer.request('/api/review/counts', { headers: read })).status).toBe(200);
    const denied = await outer.request('/api/review/answer', { method: 'POST', headers: read });
    expect(denied.status).toBe(403);
  });
});

describe('review sentence translations and AI examples', () => {
  const calls: CompletionOptions[] = [];
  let reply = '{}';
  let byok = false;
  let reserved = 0;
  let minuteLimit = 30;
  let examples: Array<{ text: string; translation?: string; translationLang?: string }> = [];

  const provider: LLMProvider = {
    name: 'fake',
    model: 'fake',
    async complete(options) {
      calls.push(options);
      return reply;
    },
    async *stream() {
      yield reply;
    },
    async healthCheck() {
      return { ok: true };
    },
  };

  function aiApp() {
    return makeReviewRoutes({
      now: () => clock,
      scheduler: createScheduler({ fuzz: false }),
      sentenceDeps: {
        forms: () => [],
        examples: () => examples,
        bank: () => [],
        library: () => null,
        random: () => 0,
      },
      ai: {
        providerForUser: () => provider,
        engine: {
          resolveEntitlements: () => ({ byok }),
          reserve: () => {
            reserved++;
          },
        } as unknown as SentenceAiDeps['engine'],
        rateLimiter: new InMemoryTranslationBurstLimiter({ localizePerWindow: minuteLimit }),
        dailyLimiter: new InMemoryTranslationBurstLimiter({ localizePerWindow: 500 }),
      },
    });
  }

  async function seedFillIn(word = 'harbor') {
    seedVocab('v1', word);
    await warm();
    db.prepare(
      "UPDATE wordCards SET state = 'review', stability = 10, reps = 3, due = ? WHERE vocabId = 'v1'",
    ).run('2026-11-01T00:00:00Z');
  }

  const sharedRows = () =>
    (
      db
        .prepare(
          `SELECT (SELECT COUNT(*) FROM shared_sentence_translation)
                + (SELECT COUNT(*) FROM shared_example_sentence) AS n`,
        )
        .get() as { n: number }
    ).n;

  const lastKey = () =>
    (
      db.prepare("SELECT lastSentenceKey AS k FROM wordCards WHERE vocabId = 'v1'").get() as {
        k: string | null;
      }
    ).k;

  beforeEach(() => {
    clear();
    db.prepare('DELETE FROM shared_sentence_translation').run();
    db.prepare('DELETE FROM shared_example_sentence').run();
    db.prepare("DELETE FROM settings WHERE key = 'nativeLanguage'").run();
    clock = NOW;
    calls.length = 0;
    reply = '{}';
    byok = false;
    reserved = 0;
    minuteLimit = 30;
    examples = [];
    setSetting('timezone', 'UTC');
    setSetting('nativeLanguage', 'zh-CN');
    app = aiApp();
  });
  afterEach(() => {
    clear();
    db.prepare('DELETE FROM shared_sentence_translation').run();
    db.prepare('DELETE FROM shared_example_sentence').run();
    db.prepare("DELETE FROM settings WHERE key = 'nativeLanguage'").run();
  });

  interface Rich extends Item {
    sentenceSource?: { kind: string };
    sentenceBlank?: unknown;
    sentenceTranslation?: { text: string; lang: string };
    translationPending?: boolean;
    aiExamplePending?: boolean;
  }

  async function queue() {
    const res = await app.request('/queue?language=en');
    expect(res.status).toBe(200);
    return (await res.json()) as { roundId: string; items: Rich[] };
  }

  test('the saved sentence on the first serve is not translated, requested or stored', async () => {
    await seedFillIn();
    const { items } = await queue();
    expect(items[0].sentenceSource?.kind).toBe('saved');
    expect(items[0].translationPending).toBeUndefined();
    expect(items[0].aiExamplePending).toBeUndefined();
    expect(calls).toHaveLength(0);
    expect(sharedRows()).toBe(0);
  });

  test('a bundled zh-CN translation of a dictionary example is used with no request', async () => {
    await seedFillIn();
    examples = [
      {
        text: 'The ship left the harbor.',
        translation: '船离开了港口。',
        translationLang: 'zh-CN',
      },
    ];
    await queue();
    const { items } = await queue();
    expect(items[0].sentenceSource?.kind).toBe('tatoeba');
    expect(items[0].sentenceTranslation).toEqual({ text: '船离开了港口。', lang: 'zh-CN' });
    expect(items[0].translationPending).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  test('a pending translation is fetched once, stored, and then served from the cache', async () => {
    await seedFillIn();
    examples = [{ text: 'The ship left the harbor.', translation: 'x', translationLang: 'en' }];
    await queue();
    const second = await queue();
    expect(second.items[0].sentenceSource?.kind).toBe('tatoeba');
    expect(second.items[0].sentenceTranslation).toBeUndefined();
    expect(second.items[0].translationPending).toBe(true);

    reply = JSON.stringify({ translation: '船离开了港口。' });
    const res = await post('/sentence-translation', {
      roundId: second.roundId,
      cardId: second.items[0].cardId,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ translation: { text: '船离开了港口。', lang: 'zh-CN' } });
    expect(calls).toHaveLength(1);
    expect(calls[0].task).toBe('sentence-translation');
    expect(reserved).toBe(0);
    expect(sharedRows()).toBe(1);

    await post('/sentence-translation', {
      roundId: second.roundId,
      cardId: second.items[0].cardId,
    });
    expect(calls).toHaveLength(1);
    db.prepare("UPDATE wordCards SET lastSentenceKey = 'saved' WHERE vocabId = 'v1'").run();
    const third = await queue();
    expect(third.items[0].sentenceTranslation).toEqual({ text: '船离开了港口。', lang: 'zh-CN' });
  });

  test('the translation request refuses a card outside the round and never sends the saved sentence', async () => {
    await seedFillIn();
    const first = await queue();
    const outside = await post('/sentence-translation', { roundId: first.roundId, cardId: 'nope' });
    expect(outside.status).toBe(400);
    const saved = await post('/sentence-translation', {
      roundId: first.roundId,
      cardId: first.items[0].cardId,
    });
    expect(await saved.json()).toEqual({ translation: null });
    expect(calls).toHaveLength(0);
    expect(sharedRows()).toBe(0);
  });

  test('burst limit reached: no translation comes back and the card keeps its sentence', async () => {
    minuteLimit = 0;
    app = aiApp();
    await seedFillIn();
    examples = [{ text: 'The ship left the harbor.' }];
    await queue();
    const round = await queue();
    const res = await post('/sentence-translation', {
      roundId: round.roundId,
      cardId: round.items[0].cardId,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ translation: null });
    expect(calls).toHaveLength(0);
    expect(sharedRows()).toBe(0);
  });

  test('AE9: a word with no library or Tatoeba sentence gets one AI example at the fill-in stage', async () => {
    await seedFillIn('quiddity');
    const first = await queue();
    expect(first.items[0].sentenceSource?.kind).toBe('saved');
    expect(first.items[0].aiExamplePending).toBeUndefined();
    const second = await queue();
    expect(second.items[0].sentenceSource?.kind).toBe('saved');
    expect(second.items[0].aiExamplePending).toBe(true);

    reply = JSON.stringify({
      sentence: 'The quiddity of the argument escaped her.',
      translation: 'The essence of the argument escaped her.',
    });
    const res = await post('/example-sentence', {
      roundId: second.roundId,
      cardId: second.items[0].cardId,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      sentence: {
        text: string;
        source: { kind: string };
        blank: { start: number; end: number };
      } | null;
      translationPending?: boolean;
    };
    expect(body.sentence?.source.kind).toBe('ai');
    expect(body.sentence?.text).toBe('The quiddity of the argument escaped her.');
    expect(body.sentence?.text.slice(body.sentence.blank.start, body.sentence.blank.end)).toBe(
      'quiddity',
    );
    expect(body.translationPending).toBe(true);
    expect(lastKey()).toBe('ai');
    expect(sharedRows()).toBe(1);
    expect(reserved).toBe(0);

    const third = await queue();
    expect(third.items[0].sentenceSource?.kind).toBe('saved');
    const fourth = await queue();
    expect(fourth.items[0].sentenceSource?.kind).toBe('ai');
    expect(fourth.items[0].sentence).toBe('The quiddity of the argument escaped her.');
    expect(fourth.items[0].aiExamplePending).toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  test('an AI sentence without the word is rejected and not stored', async () => {
    await seedFillIn('quiddity');
    await queue();
    const round = await queue();
    reply = JSON.stringify({ sentence: 'The cat sat on the mat today.', translation: 'x' });
    const res = await post('/example-sentence', {
      roundId: round.roundId,
      cardId: round.items[0].cardId,
    });
    expect(await res.json()).toEqual({ sentence: null });
    expect(sharedRows()).toBe(0);
    expect(lastKey()).toBe('saved');
  });

  test('no AI example while a library or Tatoeba sentence exists', async () => {
    await seedFillIn('harbor');
    examples = [{ text: 'The ship left the harbor.' }];
    await queue();
    const round = await queue();
    const res = await post('/example-sentence', {
      roundId: round.roundId,
      cardId: round.items[0].cardId,
    });
    expect(await res.json()).toEqual({ sentence: null });
    expect(calls).toHaveLength(0);
  });
});
