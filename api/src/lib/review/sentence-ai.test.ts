import '../../test-guard';
import { afterEach, describe, expect, test } from 'bun:test';
import { db } from '../../db';
import type { CompletionOptions, LLMProvider } from '../llm';
import { InMemoryTranslationBurstLimiter } from '../rate-limit';
import { sharedExampleSentenceCache } from '../example-sentence-cache';
import { sharedSentenceTranslationCache } from '../sentence-translation-cache';
import {
  generateExample,
  sentenceTranslationFor,
  translateSentence,
  type SentenceAiDeps,
} from './sentence-ai';

class FakeProvider implements LLMProvider {
  name = 'fake';
  model = 'fake';
  calls: CompletionOptions[] = [];
  reply = '{}';
  async complete(options: CompletionOptions) {
    this.calls.push(options);
    return this.reply;
  }
  async *stream(options: CompletionOptions): AsyncGenerator<string> {
    this.calls.push(options);
    yield this.reply;
  }
  async healthCheck() {
    return { ok: true };
  }
}

function setup(options: { byok?: boolean; minute?: number } = {}) {
  const managed = new FakeProvider();
  const own = new FakeProvider();
  const access: boolean[] = [];
  const reserved: string[] = [];
  const engine = new Proxy(
    { resolveEntitlements: () => ({ byok: options.byok ?? false }) },
    {
      get(target, prop) {
        if (prop === 'resolveEntitlements') return target.resolveEntitlements;
        reserved.push(String(prop));
        throw new Error(`engine.${String(prop)} must not be called`);
      },
    },
  ) as unknown as SentenceAiDeps['engine'];
  const deps: SentenceAiDeps = {
    providerForUser: (_userId, a) => {
      access.push(a.byok);
      return a.byok ? own : managed;
    },
    engine,
    rateLimiter: new InMemoryTranslationBurstLimiter({ localizePerWindow: options.minute ?? 30 }),
    dailyLimiter: new InMemoryTranslationBurstLimiter({ localizePerWindow: 500 }),
    translations: sharedSentenceTranslationCache,
    examples: sharedExampleSentenceCache,
    sentenceDeps: { forms: () => [] },
  };
  return { deps, managed, own, access, reserved };
}

afterEach(() => {
  db.prepare('DELETE FROM shared_sentence_translation').run();
  db.prepare('DELETE FROM shared_example_sentence').run();
});

const rows = (table: string) =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

describe('translateSentence', () => {
  test('a cache hit makes no provider call and no limiter use', async () => {
    const { deps, managed, access } = setup({ minute: 0 });
    sharedSentenceTranslationCache.put('fr', 'es', 'Le chat dort.', 'El gato duerme.');
    expect(await translateSentence(deps, 'u1', 'fr', 'es', 'Le chat dort.')).toEqual({
      text: 'El gato duerme.',
      lang: 'es',
    });
    expect(managed.calls).toHaveLength(0);
    expect(access).toHaveLength(0);
  });

  test('a managed miss calls the provider once, stores the result, and reserves nothing', async () => {
    const { deps, managed, reserved } = setup();
    managed.reply = JSON.stringify({ translation: 'El gato duerme.' });
    const out = await translateSentence(deps, 'u1', 'fr', 'es', 'Le chat dort.');
    expect(out).toEqual({ text: 'El gato duerme.', lang: 'es' });
    expect(managed.calls).toHaveLength(1);
    expect(managed.calls[0].task).toBe('sentence-translation');
    expect(rows('shared_sentence_translation')).toBe(1);
    expect(reserved).toEqual([]);
    await translateSentence(deps, 'u2', 'fr', 'es', 'Le chat dort.');
    expect(managed.calls).toHaveLength(1);
  });

  test('a BYOK miss uses the own provider and stores nothing', async () => {
    const { deps, managed, own, access } = setup({ byok: true, minute: 0 });
    own.reply = JSON.stringify({ translation: 'El gato duerme.' });
    const out = await translateSentence(deps, 'u1', 'fr', 'es', 'Le chat dort.');
    expect(out?.text).toBe('El gato duerme.');
    expect(access).toEqual([true]);
    expect(own.calls).toHaveLength(1);
    expect(managed.calls).toHaveLength(0);
    expect(rows('shared_sentence_translation')).toBe(0);
  });

  test('a BYOK learner still reads a shared hit', async () => {
    const { deps, own } = setup({ byok: true });
    sharedSentenceTranslationCache.put('fr', 'es', 'Le chat dort.', 'El gato duerme.');
    expect((await translateSentence(deps, 'u1', 'fr', 'es', 'Le chat dort.'))?.text).toBe(
      'El gato duerme.',
    );
    expect(own.calls).toHaveLength(0);
  });

  test('the burst limit returns null without a provider call', async () => {
    const { deps, managed } = setup({ minute: 1 });
    managed.reply = JSON.stringify({ translation: 'Uno.' });
    expect(await translateSentence(deps, 'u1', 'fr', 'es', 'Un.')).not.toBeNull();
    expect(await translateSentence(deps, 'u1', 'fr', 'es', 'Deux.')).toBeNull();
    expect(managed.calls).toHaveLength(1);
  });

  test('a failed or malformed reply returns null and stores nothing', async () => {
    const { deps, managed } = setup();
    managed.reply = 'not json';
    expect(await translateSentence(deps, 'u1', 'fr', 'es', 'Le chat dort.')).toBeNull();
    managed.reply = JSON.stringify({ translation: 'a\n\nb' });
    expect(await translateSentence(deps, 'u1', 'fr', 'es', 'Le chat dort.')).toBeNull();
    expect(rows('shared_sentence_translation')).toBe(0);
  });

  test('a learner whose native language is the sentence language needs none', async () => {
    const { deps, managed } = setup();
    expect(await translateSentence(deps, 'u1', 'fr', 'fr', 'Le chat dort.')).toBeNull();
    expect(managed.calls).toHaveLength(0);
  });
});

describe('sentenceTranslationFor', () => {
  const dictionaryExample = {
    text: 'The cat sleeps.',
    source: { kind: 'tatoeba' as const },
    translation: { text: '猫在睡觉。', lang: 'zh-CN' },
  };

  test('a bundled zh-CN translation serves a zh-CN learner directly', () => {
    const out = sentenceTranslationFor(
      dictionaryExample,
      'en',
      'zh-CN',
      sharedSentenceTranslationCache,
    );
    expect(out).toEqual({ translation: dictionaryExample.translation, pending: false });
  });

  test('a bundled translation in another language does not serve and leaves it pending', () => {
    const out = sentenceTranslationFor(
      { ...dictionaryExample, translation: { text: 'x', lang: 'en' } },
      'fr',
      'zh-CN',
      sharedSentenceTranslationCache,
    );
    expect(out).toEqual({ pending: true });
  });

  test('the saved sentence is never pending and never looked up', () => {
    const out = sentenceTranslationFor(
      { text: 'Mon chat dort.', source: { kind: 'saved' } },
      'fr',
      'zh-CN',
      sharedSentenceTranslationCache,
    );
    expect(out).toEqual({ pending: false });
  });
});

describe('generateExample', () => {
  const request = { word: 'éponge', type: 'word' as const, language: 'fr' };

  test('a managed miss stores one sentence per word and sends only the word and language', async () => {
    const { deps, managed, reserved } = setup();
    managed.reply = JSON.stringify({
      sentence: "J'utilise une éponge pour laver.",
      translation: 'I use a sponge to wash.',
    });
    const out = await generateExample(deps, 'u1', request);
    expect(out?.sentence).toBe("J'utilise une éponge pour laver.");
    expect(out?.translation).toBe('I use a sponge to wash.');
    expect(managed.calls).toHaveLength(1);
    const prompt = managed.calls[0].messages.map((m) => m.content).join('\n');
    expect(prompt).toContain('éponge');
    expect(managed.calls[0].task).toBe('example-sentence');
    expect(rows('shared_example_sentence')).toBe(1);
    expect(reserved).toEqual([]);
    await generateExample(deps, 'u2', request);
    expect(managed.calls).toHaveLength(1);
  });

  test('a sentence without the target word is rejected and not stored', async () => {
    const { deps, managed } = setup();
    managed.reply = JSON.stringify({ sentence: 'Le chat dort sur le canapé.', translation: 'x' });
    expect(await generateExample(deps, 'u1', request)).toBeNull();
    expect(rows('shared_example_sentence')).toBe(0);
  });

  test('the word must be a whole token, not part of a longer word', async () => {
    const { deps, managed } = setup();
    managed.reply = JSON.stringify({ sentence: 'Les épongeoirs sont secs ici.', translation: 'x' });
    expect(await generateExample(deps, 'u1', request)).toBeNull();
  });

  test('an inflected form from the dictionary counts', async () => {
    const { deps, managed } = setup();
    deps.sentenceDeps = { forms: () => ['éponges'] };
    managed.reply = JSON.stringify({
      sentence: 'Elle achète deux éponges neuves.',
      translation: null,
    });
    const out = await generateExample(deps, 'u1', request);
    expect(out?.translation).toBeNull();
    expect(out?.blank.start).toBeGreaterThan(0);
  });

  test('a BYOK miss uses the own provider and stores nothing', async () => {
    const { deps, own } = setup({ byok: true });
    own.reply = JSON.stringify({
      sentence: "J'aime cette éponge bleue.",
      translation: 'I like it.',
    });
    expect(await generateExample(deps, 'u1', request)).not.toBeNull();
    expect(own.calls).toHaveLength(1);
    expect(rows('shared_example_sentence')).toBe(0);
  });

  test('a shared hit costs no provider call', async () => {
    const { deps, managed } = setup({ minute: 0 });
    sharedExampleSentenceCache.put('fr', 'éponge', {
      sentence: 'Cette éponge est sèche.',
      translation: 'This sponge is dry.',
    });
    expect((await generateExample(deps, 'u1', request))?.sentence).toBe('Cette éponge est sèche.');
    expect(managed.calls).toHaveLength(0);
  });

  test('the burst limit returns null', async () => {
    const { deps, managed } = setup({ minute: 0 });
    expect(await generateExample(deps, 'u1', request)).toBeNull();
    expect(managed.calls).toHaveLength(0);
  });

  test('a phrase gets no AI sentence', async () => {
    const { deps, managed } = setup();
    expect(await generateExample(deps, 'u1', { ...request, type: 'phrase' })).toBeNull();
    expect(managed.calls).toHaveLength(0);
  });
});
