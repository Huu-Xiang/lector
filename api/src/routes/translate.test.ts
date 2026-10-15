import '../test-guard';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { db } from '../db';
import {
  makeEntitlements,
  NO_STORAGE_LIMITS,
  type EntitlementsEngine,
  type PaidPlanId,
  type PlanLimits,
} from '../lib/entitlements';
import type { CompletionOptions, LLMProvider, ProviderAccessOptions } from '../lib/llm';
import { InMemoryTranslationBurstLimiter } from '../lib/rate-limit';
import { getSpelreelsContext } from '../lib/spelreels';
import type { GlossCache } from '../lib/gloss-cache';
import type { EntryCache } from '../lib/entry-cache';
import type { ExpandedDictionaryEntry } from '../lib/dictionary-db';
import { makeTranslateRoutes } from './translate';

const FREE: PlanLimits = {
  ...NO_STORAGE_LIMITS,
  phraseSelectionWords: 6,
  journalWordsPerMonth: 1_000,
  maxCollections: 10,
  maxLessons: 200,
  llmRequestsPerMonth: 0,
  ttsCharsPerMonth: 0,
  wordGlossesPerMonth: 1_000,
  phraseTranslationsPerDay: 10,
  contextTranslationsPerDay: 10,
  audioTranscriptionMinutesPerMonth: 0,
};

const CLOUD: PlanLimits = {
  ...NO_STORAGE_LIMITS,
  phraseSelectionWords: 9,
  journalWordsPerMonth: 5_000,
  maxCollections: 50,
  maxLessons: 1_000,
  llmRequestsPerMonth: 5_000,
  ttsCharsPerMonth: 300_000,
  wordGlossesPerMonth: 10_000,
  phraseTranslationsPerDay: null,
  contextTranslationsPerDay: null,
  audioTranscriptionMinutesPerMonth: null,
};

const PLUS: PlanLimits = {
  ...NO_STORAGE_LIMITS,
  phraseSelectionWords: null,
  journalWordsPerMonth: null,
  maxCollections: null,
  maxLessons: null,
  llmRequestsPerMonth: 20_000,
  ttsCharsPerMonth: 1_500_000,
  wordGlossesPerMonth: 50_000,
  phraseTranslationsPerDay: null,
  contextTranslationsPerDay: null,
  audioTranscriptionMinutesPerMonth: null,
};

class FakeProvider implements LLMProvider {
  name = 'fake';
  model = 'user-selected-model';
  calls: CompletionOptions[] = [];
  completeImpl?: (options: CompletionOptions) => Promise<string>;
  streamImpl?: (options: CompletionOptions) => AsyncIterable<string>;

  async complete(options: CompletionOptions): Promise<string> {
    this.calls.push(options);
    if (this.completeImpl) return this.completeImpl(options);
    if (options.task === 'phrase-simple') return 'natural phrase';
    if (options.task === 'context-simple') return 'fitting sense';
    if (options.task === 'phrase-rich') {
      return JSON.stringify({
        translation: 'rich phrase',
        literalBreakdown: 'literal detail',
        usageNotes: 'teaching detail',
      });
    }
    return JSON.stringify({
      word: 'woord',
      senses: [{ partOfSpeech: 'noun', gloss: 'rich sense' }],
      etymology: 'an origin',
    });
  }

  async *stream(options: CompletionOptions): AsyncGenerator<string> {
    this.calls.push(options);
    if (this.streamImpl) {
      yield* this.streamImpl(options);
      return;
    }
    yield 'meaning';
  }

  async healthCheck() {
    return { ok: true };
  }
}

function makeEngine(options: {
  now: () => Date;
  byok?: boolean | (() => boolean);
  compedPlan?: PaidPlanId | null;
  limits?: Partial<Record<'free' | 'cloud' | 'plus' | 'max', Partial<PlanLimits>>>;
}): EntitlementsEngine {
  const merge = (base: PlanLimits, override?: Partial<PlanLimits>): PlanLimits => ({
    ...base,
    ...override,
  });
  return makeEntitlements({
    enforced: true,
    freeTierEnabled: true,
    exemptEmails: new Set(),
    prices: [],
    planLimits: {
      free: merge(FREE, options.limits?.free),
      cloud: merge(CLOUD, options.limits?.cloud),
      plus: merge(PLUS, options.limits?.plus),
      max: merge(PLUS, options.limits?.max),
    },
    resolveEmail: () => null,
    isByok: () => (typeof options.byok === 'function' ? options.byok() : (options.byok ?? false)),
    compedPlan: () => options.compedPlan ?? null,
    now: options.now,
  });
}

function makeApp(options: {
  engine: EntitlementsEngine;
  provider?: FakeProvider;
  limiter?: InMemoryTranslationBurstLimiter;
  providerForUser?: (userId: string, access: ProviderAccessOptions) => LLMProvider;
  glossCache?: GlossCache | null;
  entryCache?: EntryCache | null;
  lookupEntry?: (userId: string, word: string, language: string) => ExpandedDictionaryEntry | null;
}) {
  const provider = options.provider ?? new FakeProvider();
  const providerUserIds: string[] = [];
  const providerAccess: Array<{ userId: string; byok: boolean }> = [];
  const app = makeTranslateRoutes({
    engine: options.engine,
    providerForUser: (userId, access) => {
      providerUserIds.push(userId);
      providerAccess.push({ userId, byok: access.byok });
      return options.providerForUser?.(userId, access) ?? provider;
    },
    rateLimiter:
      options.limiter ??
      new InMemoryTranslationBurstLimiter({ glossPerWindow: 10_000, detailPerWindow: 10_000 }),
    glossCache: options.glossCache ?? null,
    entryCache: options.entryCache ?? null,
    lookupEntry: options.lookupEntry ?? (() => null),
  });
  return { app, provider, providerUserIds, providerAccess };
}

function post(app: ReturnType<typeof makeTranslateRoutes>, path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function planLimit(res: Response, metric: string) {
  expect(res.status).toBe(429);
  const body = (await res.json()) as Record<string, unknown>;
  expect(body).toMatchObject({ error: 'plan_limit', metric });
  return body;
}

function resetTranslationRows() {
  db.prepare("DELETE FROM usage_counters WHERE userId = 'local'").run();
  db.prepare("DELETE FROM settings WHERE userId = 'local' AND key = 'targetLanguage'").run();
}

beforeEach(resetTranslationRows);
afterEach(resetTranslationRows);

describe('translation input boundaries', () => {
  test('rejects malformed and oversized values before quota or provider work', async () => {
    const engine = makeEngine({ now: () => new Date('2026-07-15T12:00:00Z') });
    const { app, provider } = makeApp({ engine });
    const requests = [
      { path: '/gloss', body: { word: ['huis'] } },
      { path: '/gloss', body: { word: 'two words' } },
      { path: '/gloss', body: { word: 'x'.repeat(129) } },
      { path: '/', body: { word: 'huis', sentence: 42, type: 'word' } },
      { path: '/', body: { word: 'huis', sentence: 'x'.repeat(1_001), type: 'word' } },
      { path: '/', body: { word: 'huis', type: 'cheap' } },
      { path: '/', body: { word: 'x'.repeat(257), type: 'phrase' } },
    ];

    for (const request of requests) {
      const res = await post(app, request.path, request.body);
      expect(res.status).toBe(400);
    }
    expect(provider.calls).toHaveLength(0);
    expect(engine.getUsage('local', 'wordGlossesPerMonth')).toBe(0);
    expect(engine.getUsage('local', 'phraseTranslationsPerDay')).toBe(0);
    expect(engine.getUsage('local', 'contextTranslationsPerDay')).toBe(0);
  });

  test('a cheaper managed phrase model gets a prompt without idiom origins', async () => {
    const previous = process.env.OPENAI_COMPAT_PHRASE_RICH_MODEL;
    try {
      const engine = makeEngine({
        now: () => new Date('2026-07-15T12:00:00Z'),
        compedPlan: 'cloud',
      });
      const { app, provider } = makeApp({ engine });

      delete process.env.OPENAI_COMPAT_PHRASE_RICH_MODEL;
      await post(app, '/', { word: 'goeie dag', type: 'phrase' });
      process.env.OPENAI_COMPAT_PHRASE_RICH_MODEL = 'cheap-model';
      await post(app, '/', { word: 'goeie dag', type: 'phrase' });

      const [full, cheap] = provider.calls.map((call) => call.messages[0].content);
      expect(full).not.toContain('Do not explain where an expression comes from');
      expect(cheap).toContain('Do not explain where an expression comes from');
    } finally {
      if (previous === undefined) delete process.env.OPENAI_COMPAT_PHRASE_RICH_MODEL;
      else process.env.OPENAI_COMPAT_PHRASE_RICH_MODEL = previous;
    }
  });

  test('rejects an oversized raw body before parsing, quota, or provider work', async () => {
    const engine = makeEngine({ now: () => new Date('2026-07-15T12:00:00Z') });
    const { app, provider } = makeApp({ engine });
    const response = await app.request('/gloss', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(16 * 1024 + 1),
      },
      body: JSON.stringify({ word: 'huis' }),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'Translation request is too large' });
    expect(provider.calls).toHaveLength(0);
    expect(engine.getUsage('local', 'wordGlossesPerMonth')).toBe(0);
  });
});

describe('self-managed Free on a small model', () => {
  test('gets rich answers metered monthly, without idiom origins or etymology', async () => {
    const previous = [process.env.LECTOR_SELF_MANAGED, process.env.OPENAI_COMPAT_FREE_MODEL];
    try {
      process.env.LECTOR_SELF_MANAGED = '1';
      process.env.OPENAI_COMPAT_FREE_MODEL = 'small-model';
      const engine = makeEngine({
        now: () => new Date('2026-07-15T12:00:00Z'),
        limits: { free: { llmRequestsPerMonth: 2 } },
      });
      const { app, provider } = makeApp({ engine });

      const phrase = await post(app, '/', { word: 'goeie dag', type: 'phrase', language: 'af' });
      expect(await phrase.json()).toMatchObject({ translation: 'rich phrase' });
      const word = await post(app, '/', { word: 'trek', type: 'word', language: 'af' });
      const entry = (await word.json()) as Record<string, unknown>;
      expect(entry.translation).toBe('rich sense');
      expect(entry.etymology).toBeUndefined();
      await planLimit(
        await post(app, '/', { word: 'nog een', type: 'phrase' }),
        'llmRequestsPerMonth',
      );

      expect(provider.calls.map((call) => call.task)).toEqual(['phrase-rich', 'context-rich']);
      expect(provider.calls[0].messages[0].content).toContain(
        'Do not explain where an expression comes from',
      );
      expect(engine.getUsage('local', 'llmRequestsPerMonth')).toBe(2);
      expect(engine.getUsage('local', 'phraseTranslationsPerDay')).toBe(0);
    } finally {
      const [selfManaged, freeModel] = previous;
      if (selfManaged === undefined) delete process.env.LECTOR_SELF_MANAGED;
      else process.env.LECTOR_SELF_MANAGED = selfManaged;
      if (freeModel === undefined) delete process.env.OPENAI_COMPAT_FREE_MODEL;
      else process.env.OPENAI_COMPAT_FREE_MODEL = freeModel;
    }
  });
});

describe('managed Free translations', () => {
  test('meters a residual gloss separately and uses the bounded gloss task', async () => {
    const engine = makeEngine({ now: () => new Date('2026-07-15T12:00:00Z') });
    const { app, provider } = makeApp({ engine });

    const res = await post(app, '/gloss', {
      word: 'huis',
      sentence: 'Die huis is groot.',
      language: 'af',
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('meaning');
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]).toMatchObject({ task: 'word-gloss', maxTokens: 32 });
    expect(engine.getUsage('local', 'wordGlossesPerMonth')).toBe(1);
    expect(engine.getUsage('local', 'llmRequestsPerMonth')).toBe(0);
  });

  test('returns translation-only phrase/context responses with small prompts and budgets', async () => {
    const engine = makeEngine({ now: () => new Date('2026-07-15T12:00:00Z') });
    const { app, provider } = makeApp({ engine });

    const phraseRes = await post(app, '/', {
      word: 'een twee drie vier vyf ses',
      sentence: 'een twee drie vier vyf ses.',
      type: 'phrase',
      language: 'af',
      detail: 'rich',
    });
    expect(phraseRes.status).toBe(200);
    expect(await phraseRes.json()).toEqual({ translation: 'natural phrase' });

    const contextRes = await post(app, '/', {
      word: 'trek',
      sentence: 'Ons trek môre Kaap toe.',
      type: 'word',
      language: 'af',
      detail: 'rich',
    });
    expect(contextRes.status).toBe(200);
    expect(await contextRes.json()).toEqual({ translation: 'fitting sense' });

    expect(provider.calls.map((call) => [call.task, call.maxTokens])).toEqual([
      ['phrase-simple', 96],
      ['context-simple', 96],
    ]);
    expect(provider.calls[0].messages[0].content).not.toContain(getSpelreelsContext());
    expect(provider.calls[0].messages[0].content).not.toContain('literalBreakdown');
    expect(engine.getUsage('local', 'phraseTranslationsPerDay')).toBe(1);
    expect(engine.getUsage('local', 'contextTranslationsPerDay')).toBe(1);
    expect(engine.getUsage('local', 'llmRequestsPerMonth')).toBe(0);
  });

  test('resolves an omitted language from the current user setting before prompting', async () => {
    db.prepare('INSERT INTO settings (userId, key, value) VALUES (?, ?, ?)').run(
      'local',
      'targetLanguage',
      '"de"',
    );
    const engine = makeEngine({ now: () => new Date('2026-07-15T12:00:00Z') });
    const { app, provider } = makeApp({ engine });

    const response = await post(app, '/', {
      word: 'ziehen',
      sentence: 'Wir ziehen morgen um.',
      type: 'word',
    });

    expect(response.status).toBe(200);
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0].messages[0].content).toContain('German');
    expect(provider.calls[0].messages[0].content).not.toContain('Afrikaans');
  });

  test('rejects seven phrase words and managed enrichment without calling a provider', async () => {
    const engine = makeEngine({ now: () => new Date('2026-07-15T12:00:00Z') });
    const { app, provider } = makeApp({ engine });

    await planLimit(
      await post(app, '/', {
        word: 'een twee drie vier vyf ses sewe',
        type: 'phrase',
      }),
      'phraseSelectionWords',
    );
    const enrich = await post(app, '/enrich', { word: 'huis', sentence: 'Die huis.' });
    const body = await planLimit(enrich, 'llmRequestsPerMonth');
    expect(body.upgrade).toBe('cloud');
    expect(provider.calls).toHaveLength(0);
  });

  test('the 10th phrase/context call passes, the 11th fails, and the next UTC day resets', async () => {
    let now = new Date('2026-07-15T12:00:00Z');
    const engine = makeEngine({ now: () => now });
    const { app, provider } = makeApp({ engine });

    for (let index = 0; index < 10; index += 1) {
      expect((await post(app, '/', { word: 'goeie dag', type: 'phrase' })).status).toBe(200);
      expect(
        (await post(app, '/', { word: 'trek', sentence: 'Ons trek.', type: 'word' })).status,
      ).toBe(200);
    }
    await planLimit(
      await post(app, '/', { word: 'goeie dag', type: 'phrase' }),
      'phraseTranslationsPerDay',
    );
    await planLimit(
      await post(app, '/', { word: 'trek', sentence: 'Ons trek.', type: 'word' }),
      'contextTranslationsPerDay',
    );
    expect(provider.calls).toHaveLength(20);

    now = new Date('2026-07-16T00:00:00Z');
    expect((await post(app, '/', { word: 'goeie dag', type: 'phrase' })).status).toBe(200);
    expect((await post(app, '/', { word: 'trek', type: 'word' })).status).toBe(200);
  });
});

describe('paid and BYOK translation paths', () => {
  test('Cloud retains rich phrase/context output and both share the general LLM pool', async () => {
    const engine = makeEngine({
      now: () => new Date('2026-07-15T12:00:00Z'),
      compedPlan: 'cloud',
      limits: { cloud: { llmRequestsPerMonth: 2 } },
    });
    const { app, provider } = makeApp({ engine });

    const phrase = await post(app, '/', { word: 'goeie dag', type: 'phrase', language: 'af' });
    expect(await phrase.json()).toMatchObject({
      translation: 'rich phrase',
      literalBreakdown: 'literal detail',
    });
    const context = await post(app, '/', { word: 'trek', type: 'word' });
    expect(await context.json()).toMatchObject({
      translation: 'rich sense',
      etymology: 'an origin',
    });
    await planLimit(
      await post(app, '/', { word: 'nog een', type: 'phrase' }),
      'llmRequestsPerMonth',
    );

    expect(provider.calls.map((call) => call.task)).toEqual(['phrase-rich', 'context-rich']);
    expect(provider.calls[0].messages[0].content).toContain(getSpelreelsContext());
    expect(engine.getUsage('local', 'llmRequestsPerMonth')).toBe(2);
    expect(engine.getUsage('local', 'phraseTranslationsPerDay')).toBe(0);
    expect(engine.getUsage('local', 'contextTranslationsPerDay')).toBe(0);
  });

  test('Free BYOK takes rich paths and consumes only the separate abuse ceiling', async () => {
    const engine = makeEngine({
      now: () => new Date('2026-07-15T12:00:00Z'),
      byok: true,
    });
    const { app, provider, providerUserIds, providerAccess } = makeApp({ engine });

    const phrase = await post(app, '/', {
      word: 'meer as ses woorde word met eie sleutel toegelaat',
      type: 'phrase',
    });
    expect(phrase.status).toBe(200);
    expect(await phrase.json()).toMatchObject({ literalBreakdown: 'literal detail' });
    const enrich = await post(app, '/enrich', { word: 'huis' });
    expect(enrich.status).toBe(200);
    const gloss = await post(app, '/gloss', { word: 'huis' });
    expect(gloss.status).toBe(200);
    expect(await gloss.text()).toBe('meaning');

    expect(provider.calls.map((call) => call.task)).toEqual([
      'phrase-rich',
      'word-enrichment',
      'word-gloss',
    ]);
    expect(providerUserIds).toEqual(['local', 'local', 'local']);
    expect(providerAccess).toEqual([
      { userId: 'local', byok: true },
      { userId: 'local', byok: true },
      { userId: 'local', byok: true },
    ]);
    expect(engine.getUsage('local', 'llmRequestsPerMonth')).toBe(3);
    expect(engine.getUsage('local', 'phraseTranslationsPerDay')).toBe(0);
    expect(engine.getUsage('local', 'wordGlossesPerMonth')).toBe(0);
  });
});

describe('provider funding-mode races', () => {
  test('a BYOK removal after reservation fails closed and refunds instead of using managed AI', async () => {
    let credentialAvailable = true;
    const engine = makeEngine({
      now: () => new Date('2026-07-15T12:00:00Z'),
      byok: () => credentialAvailable,
    });
    const provider = new FakeProvider();
    const { app, providerAccess } = makeApp({
      engine,
      provider,
      providerForUser: (_userId, access) => {
        credentialAvailable = false;
        if (access.byok) throw new Error('BYOK credential is no longer available');
        return provider;
      },
    });

    const response = await post(app, '/gloss', { word: 'huis' });
    expect(response.status).toBe(500);
    expect(providerAccess).toEqual([{ userId: 'local', byok: true }]);
    expect(provider.calls).toHaveLength(0);
    expect(engine.getUsage('local', 'llmRequestsPerMonth')).toBe(0);
    expect(engine.getUsage('local', 'wordGlossesPerMonth')).toBe(0);
  });

  test('a BYOK addition after managed reservation stays on the managed path', async () => {
    let credentialAvailable = false;
    const engine = makeEngine({
      now: () => new Date('2026-07-15T12:00:00Z'),
      byok: () => credentialAvailable,
    });
    const provider = new FakeProvider();
    const { app, providerAccess } = makeApp({
      engine,
      provider,
      providerForUser: (_userId, access) => {
        credentialAvailable = true;
        expect(access.byok).toBe(false);
        return provider;
      },
    });

    const response = await post(app, '/gloss', { word: 'huis' });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('meaning');
    expect(providerAccess).toEqual([{ userId: 'local', byok: false }]);
    expect(provider.calls).toHaveLength(1);
    expect(engine.getUsage('local', 'wordGlossesPerMonth')).toBe(1);
    expect(engine.getUsage('local', 'llmRequestsPerMonth')).toBe(0);
  });
});

describe('refunds and burst protection', () => {
  test('refunds the original daily period when a failed call crosses midnight', async () => {
    let now = new Date('2026-07-15T23:59:59Z');
    const engine = makeEngine({ now: () => now });
    const provider = new FakeProvider();
    provider.completeImpl = async () => {
      now = new Date('2026-07-16T00:00:01Z');
      throw new Error('upstream unavailable');
    };
    const { app } = makeApp({ engine, provider });

    const res = await post(app, '/', { word: 'goeie dag', type: 'phrase' });
    expect(res.status).toBe(500);
    const old = db
      .prepare(
        "SELECT value FROM usage_counters WHERE userId='local' AND metric='phraseTranslationsPerDay' AND period='2026-07-15'",
      )
      .get() as { value: number } | undefined;
    expect(old?.value).toBe(0);
    expect(engine.getUsage('local', 'phraseTranslationsPerDay')).toBe(0);
  });

  test('refunds an empty or failed gloss while keeping successful gloss usage', async () => {
    const engine = makeEngine({ now: () => new Date('2026-07-15T12:00:00Z') });
    const provider = new FakeProvider();
    provider.streamImpl = async function* () {
      throw new Error('stream failed');
    };
    const { app } = makeApp({ engine, provider });

    const failed = await post(app, '/gloss', { word: 'huis' });
    expect(failed.status).toBe(200);
    expect(await failed.text()).toBe('');
    expect(engine.getUsage('local', 'wordGlossesPerMonth')).toBe(0);

    provider.streamImpl = async function* () {
      yield 'meaning';
    };
    const ok = await post(app, '/gloss', { word: 'huis' });
    expect(await ok.text()).toBe('meaning');
    expect(engine.getUsage('local', 'wordGlossesPerMonth')).toBe(1);
  });

  test('Free burst rejection happens before durable quota and provider work', async () => {
    const engine = makeEngine({ now: () => new Date('2026-07-15T12:00:00Z') });
    const limiter = new InMemoryTranslationBurstLimiter({
      glossPerWindow: 1,
      detailPerWindow: 1,
    });
    const { app, provider } = makeApp({ engine, limiter });

    expect((await post(app, '/', { word: 'goeie dag', type: 'phrase' })).status).toBe(200);
    const limited = await post(app, '/', { word: 'trek', type: 'word' });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: 'rate_limited', retryAfterSeconds: 60 });
    expect(provider.calls).toHaveLength(1);
    expect(engine.getUsage('local', 'phraseTranslationsPerDay')).toBe(1);
    expect(engine.getUsage('local', 'contextTranslationsPerDay')).toBe(0);
  });
});

class MemoryGlossCache implements GlossCache {
  rows = new Map<string, string>();
  get(language: string, native: string, word: string) {
    return this.rows.get(`${language}|${native}|${word.toLowerCase()}`) ?? null;
  }
  put(language: string, native: string, word: string, gloss: string) {
    this.rows.set(`${language}|${native}|${word.toLowerCase()}`, gloss);
  }
}

describe('shared gloss cache', () => {
  const now = () => new Date('2026-07-15T12:00:00Z');

  test('a repeat lookup is served from the cache without the provider or any quota', async () => {
    const cache = new MemoryGlossCache();
    const engine = makeEngine({ now, limits: { cloud: { wordGlossesPerMonth: 1 } } });
    const { app, provider } = makeApp({ engine, glossCache: cache });
    const first = await post(app, '/gloss', { word: 'Huis', sentence: 'Dit is my huis.' });
    expect(await first.text()).toBe('meaning');
    expect(provider.calls).toHaveLength(1);

    const second = await post(app, '/gloss', { word: 'huis', sentence: 'Ander sin.' });
    expect(second.status).toBe(200);
    expect(await second.text()).toBe('meaning');
    expect(provider.calls).toHaveLength(1);
  });

  test('a user own-key answer is never written to the shared cache', async () => {
    const cache = new MemoryGlossCache();
    const engine = makeEngine({ now, byok: true });
    const { app } = makeApp({ engine, glossCache: cache });
    await (await post(app, '/gloss', { word: 'huis', sentence: 'x' })).text();
    expect(cache.rows.size).toBe(0);
  });

  test('an empty answer is not cached', async () => {
    const cache = new MemoryGlossCache();
    const provider = new FakeProvider();
    provider.streamImpl = async function* () {
      yield '   ';
    };
    const { app } = makeApp({ engine: makeEngine({ now }), provider, glossCache: cache });
    await (await post(app, '/gloss', { word: 'huis', sentence: 'x' })).text();
    expect(cache.rows.size).toBe(0);
  });
});

class MemoryEntryCache implements EntryCache {
  rows = new Map<string, string[]>();
  get(language: string, native: string, word: string) {
    return this.rows.get(`${language}|${native}|${word.toLowerCase()}`) ?? null;
  }
  put(language: string, native: string, word: string, glosses: string[]) {
    this.rows.set(`${language}|${native}|${word.toLowerCase()}`, glosses);
  }
}

describe('dictionary entry localization', () => {
  const now = () => new Date('2026-07-15T12:00:00Z');
  const entry: ExpandedDictionaryEntry = {
    word: 'fois',
    source: 'dict',
    senses: [
      { partOfSpeech: 'noun', gloss: 'time (an instance)' },
      { partOfSpeech: 'noun', gloss: 'plural of foi' },
    ],
  };
  const lookupEntry = () => entry;

  function setNative(code: string | null) {
    db.prepare("DELETE FROM settings WHERE userId = 'local' AND key = 'nativeLanguage'").run();
    if (code) {
      db.prepare(
        "INSERT INTO settings (userId, key, value) VALUES ('local', 'nativeLanguage', ?)",
      ).run(JSON.stringify(code));
    }
  }

  function chineseProvider() {
    const provider = new FakeProvider();
    provider.completeImpl = async () => JSON.stringify({ glosses: ['次', 'foi 的复数'] });
    return provider;
  }

  afterEach(() => setNative(null));

  test('translates the senses once, then serves repeats from the shared cache', async () => {
    setNative('zh-CN');
    const cache = new MemoryEntryCache();
    const provider = chineseProvider();
    const engine = makeEngine({ now });
    const { app } = makeApp({ engine, provider, entryCache: cache, lookupEntry });

    const first = await (await post(app, '/localize', { word: 'fois', language: 'fr' })).json();
    expect(first.senses).toEqual([
      { partOfSpeech: 'noun', gloss: '次' },
      { partOfSpeech: 'noun', gloss: 'foi 的复数' },
    ]);
    expect(engine.getUsage('local', 'wordGlossesPerMonth')).toBe(0);

    const second = await (await post(app, '/localize', { word: 'fois', language: 'fr' })).json();
    expect(second.senses).toEqual(first.senses);
    expect(provider.calls).toHaveLength(1);
  });

  test('an inflected form reads and writes the base word cache row', async () => {
    setNative('zh-CN');
    const cache = new MemoryEntryCache();
    const inflected = () => ({
      ...entry,
      word: 'chantait',
      lemmaInfo: { stem: 'chanter', label: 'imperfect of' },
    });
    const { app, provider } = makeApp({
      engine: makeEngine({ now }),
      provider: chineseProvider(),
      entryCache: cache,
      lookupEntry: inflected,
    });
    await post(app, '/localize', { word: 'chantait', language: 'fr' });
    expect([...cache.rows.keys()]).toEqual(['fr|zh-CN|chanter']);
    await post(app, '/localize', { word: 'chantait', language: 'fr' });
    expect(provider.calls).toHaveLength(1);
  });

  test('does not use the monthly allowance, but a burst of new words is limited', async () => {
    setNative('zh-CN');
    const engine = makeEngine({ now, limits: { cloud: { wordGlossesPerMonth: 0 } } });
    const limiter = new InMemoryTranslationBurstLimiter({ localizePerWindow: 2 });
    const { app, provider } = makeApp({
      engine,
      provider: chineseProvider(),
      limiter,
      lookupEntry,
    });
    expect((await post(app, '/localize', { word: 'fois', language: 'fr' })).status).toBe(200);
    expect((await post(app, '/localize', { word: 'fois', language: 'fr' })).status).toBe(200);
    expect((await post(app, '/localize', { word: 'fois', language: 'fr' })).status).toBe(429);
    expect(provider.calls).toHaveLength(2);
    expect(engine.getUsage('local', 'wordGlossesPerMonth')).toBe(0);
  });

  test('returns null for an English reader and never calls the model', async () => {
    setNative('en');
    const provider = chineseProvider();
    const { app } = makeApp({ engine: makeEngine({ now }), provider, lookupEntry });
    expect(await (await post(app, '/localize', { word: 'fois', language: 'fr' })).json()).toEqual({
      senses: null,
    });
    expect(provider.calls).toHaveLength(0);
  });

  test('returns null when the dictionary has no entry or only a learned one', async () => {
    setNative('zh-CN');
    const provider = chineseProvider();
    const miss = makeApp({ engine: makeEngine({ now }), provider });
    expect(
      (await (await post(miss.app, '/localize', { word: 'zzz', language: 'fr' })).json()).senses,
    ).toBeNull();
    const learned = makeApp({
      engine: makeEngine({ now }),
      provider,
      lookupEntry: () => ({ ...entry, source: 'cache' }),
    });
    expect(
      (await (await post(learned.app, '/localize', { word: 'fois', language: 'fr' })).json())
        .senses,
    ).toBeNull();
    expect(provider.calls).toHaveLength(0);
  });

  test('a wrong-length answer is not cached', async () => {
    setNative('zh-CN');
    const cache = new MemoryEntryCache();
    const provider = new FakeProvider();
    provider.completeImpl = async () => JSON.stringify({ glosses: ['only one'] });
    const engine = makeEngine({ now });
    const { app } = makeApp({ engine, provider, entryCache: cache, lookupEntry });
    expect((await post(app, '/localize', { word: 'fois', language: 'fr' })).status).toBe(502);
    expect(cache.rows.size).toBe(0);
    expect(engine.getUsage('local', 'wordGlossesPerMonth')).toBe(0);
  });

  test('a user own-key answer is not written to the shared cache', async () => {
    setNative('zh-CN');
    const cache = new MemoryEntryCache();
    const { app } = makeApp({
      engine: makeEngine({ now, byok: true }),
      provider: chineseProvider(),
      entryCache: cache,
      lookupEntry,
    });
    expect((await post(app, '/localize', { word: 'fois', language: 'fr' })).status).toBe(200);
    expect(cache.rows.size).toBe(0);
  });
});
