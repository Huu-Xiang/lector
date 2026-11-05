import '../../test-guard';
import { beforeEach, describe, expect, test } from 'bun:test';
import { db } from '../../db';
import type { ExpandedDictionaryEntry } from '../dictionary-db';
import type { EntitlementsEngine } from '../entitlements';
import type { CompletionOptions, LLMProvider } from '../llm';
import type { LocalizeDeps } from '../localize-entry';
import { InMemoryTranslationBurstLimiter } from '../rate-limit';
import { entitlements } from '../entitlements';
import { backfillWordCards } from './backfill';
import { createMeaningRefresh, MAX_REFRESH_PER_FETCH, type RefreshTarget } from './meaning-refresh';

const NOW = Date.parse('2026-11-04T12:00:00Z');
const TS = '2026-01-01T00:00:00Z';

class Provider implements LLMProvider {
  name = 'fake';
  model = 'fake';
  calls: CompletionOptions[] = [];
  async complete(options: CompletionOptions) {
    this.calls.push(options);
    return JSON.stringify({ glosses: ['犬'] });
  }
  async *stream() {
    yield '';
  }
  async healthCheck() {
    return { ok: true };
  }
}

function setup(options: { burst?: number; entries?: (word: string) => boolean } = {}) {
  const provider = new Provider();
  const reserved: string[] = [];
  const engine = {
    resolveEntitlements: () => ({ byok: false }),
    reserve: (_user: string, metric: string) => {
      reserved.push(metric);
      throw new Error('the allowance must stay untouched');
    },
  } as unknown as EntitlementsEngine;
  const deps: LocalizeDeps = {
    providerForUser: () => provider,
    engine,
    rateLimiter: new InMemoryTranslationBurstLimiter({
      localizePerWindow: options.burst ?? 10_000,
    }),
    dailyLocalizeLimiter: new InMemoryTranslationBurstLimiter({ localizePerWindow: 10_000 }),
    entryCache: null,
    lookupEntry: (_user, word): ExpandedDictionaryEntry | null =>
      (options.entries ?? (() => true))(word)
        ? { word, source: 'dict', senses: [{ partOfSpeech: 'noun', gloss: 'dog' }] }
        : null,
  };
  return { provider, reserved, deps };
}

function seed(id: string, text: string, translation: string, lang: string | null = null) {
  db.prepare(
    `INSERT INTO vocab (id, text, type, sentence, translation, translationLang, state, stateUpdatedAt, createdAt, language)
     VALUES (?, ?, 'word', 's', ?, ?, 'level1', ?, ?, 'fr')`,
  ).run(id, text, translation, lang, TS, TS);
}

const target = (word: string): RefreshTarget => ({ word, wordKey: word, language: 'fr' });
const row = (id: string) =>
  db.prepare('SELECT translation, translationLang FROM vocab WHERE id = ?').get(id);

function setNative(code: string) {
  db.prepare("DELETE FROM settings WHERE key = 'nativeLanguage'").run();
  db.prepare("INSERT INTO settings (userId, key, value) VALUES ('local', 'nativeLanguage', ?)").run(
    JSON.stringify(code),
  );
}

beforeEach(() => {
  for (const table of ['wordReviewLog', 'reviewRounds', 'wordCards', 'knownWords', 'vocab']) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
  db.prepare("DELETE FROM settings WHERE key = 'nativeLanguage'").run();
  db.prepare("DELETE FROM usage_counters WHERE userId = 'local'").run();
  setNative('ja');
});

describe('createMeaningRefresh', () => {
  test('rewrites an English meaning in the learner language and records the language', async () => {
    seed('v1', 'chien', 'dog', 'en');
    seed('v2', 'chien', 'a dog');
    const { deps, provider } = setup();
    await createMeaningRefresh(deps)('local', [target('chien')]);
    expect(provider.calls).toHaveLength(1);
    expect(row('v1')).toEqual({ translation: '犬', translationLang: 'ja' });
    expect(row('v2')).toEqual({ translation: '犬', translationLang: 'ja' });
  });

  test('keeps a meaning that already matches', async () => {
    seed('v1', 'chien', '犬だ', 'ja');
    const { deps } = setup();
    await createMeaningRefresh(deps)('local', [target('chien')]);
    expect(row('v1')).toEqual({ translation: '犬だ', translationLang: 'ja' });
  });

  test('handles at most the cap per call and skips words without an entry', async () => {
    const targets: RefreshTarget[] = [];
    for (let i = 0; i < 14; i++) {
      seed(`v${i}`, `mot${i}`, 'word', 'en');
      targets.push(target(`mot${i}`));
    }
    seed('none', 'rien', 'nothing', 'en');
    const { deps, provider } = setup({ entries: (word) => word !== 'rien' });
    await createMeaningRefresh(deps)('local', [target('rien'), ...targets]);
    expect(MAX_REFRESH_PER_FETCH).toBe(10);
    expect(provider.calls).toHaveLength(10);
    expect(row('none')).toEqual({ translation: 'nothing', translationLang: 'en' });
    const changed = db
      .prepare("SELECT COUNT(*) AS n FROM vocab WHERE translationLang = 'ja'")
      .get() as { n: number };
    expect(changed.n).toBe(10);
  });

  test('never reserves the monthly allowance', async () => {
    seed('v1', 'chien', 'dog', 'en');
    const { deps, reserved } = setup();
    await createMeaningRefresh(deps)('local', [target('chien')]);
    expect(reserved).toEqual([]);
    for (const metric of ['wordGlossesPerMonth', 'llmRequestsPerMonth'] as const) {
      expect(entitlements.getUsage('local', metric)).toBe(0);
    }
    expect(row('v1')).toEqual({ translation: '犬', translationLang: 'ja' });
  });

  test('stops at the burst limit and swallows provider errors', async () => {
    seed('a', 'un', 'one', 'en');
    seed('b', 'deux', 'two', 'en');
    const { deps, provider } = setup({ burst: 1 });
    await createMeaningRefresh(deps)('local', [target('un'), target('deux')]);
    expect(provider.calls).toHaveLength(1);
    expect(row('b')).toEqual({ translation: 'two', translationLang: 'en' });

    const failing = setup();
    failing.provider.complete = async () => {
      throw new Error('down');
    };
    await createMeaningRefresh(failing.deps)('local', [target('deux')]);
    expect(row('b')).toEqual({ translation: 'two', translationLang: 'en' });
  });

  test('does nothing for English, where the dictionary is already in the learner language', async () => {
    setNative('en');
    seed('v1', 'chien', '犬', 'ja');
    const { deps, provider } = setup();
    await createMeaningRefresh(deps)('local', [target('chien')]);
    expect(provider.calls).toHaveLength(0);
  });

  test('backfilled cards reach it through the same word key', async () => {
    seed('v1', 'chien', 'dog', 'en');
    backfillWordCards('local', 'fr', NOW);
    const { deps } = setup();
    await createMeaningRefresh(deps)('local', [target('chien')]);
    expect(row('v1')).toEqual({ translation: '犬', translationLang: 'ja' });
  });
});
