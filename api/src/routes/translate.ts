import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { stream, streamText } from 'hono/streaming';
import {
  completeJson,
  LLMContentFilterError,
  providerAnswered,
  getProvider,
  managedPhraseUsesCheapModel,
  type LLMProvider,
  type LLMTask,
  type ProviderAccessOptions,
} from '../lib/llm';
import { parseLooseJsonResult } from '../lib/llm/parse-json';
import { JsonTextExtractor } from '../lib/json-text-stream';
import { getSpelreelsContext } from '../lib/spelreels';
import { resolveLanguage } from '../lib/active-language';
import { getCurrentUserId } from '../lib/user';
import { getLanguageConfig } from '../lib/languages';
import { getNativeLanguageCode, getNativeLanguageName } from '../lib/native-language';
import { sharedGlossCache, type GlossCache } from '../lib/gloss-cache';
import { sharedEntryCache, type EntryCache } from '../lib/entry-cache';
import { lookupWord, type ExpandedDictionaryEntry } from '../lib/dictionary-db';
import {
  buildGlossPrompt,
  buildPhrasePrompt,
  buildSimpleContextPrompt,
  buildContextExplanationPrompt,
  buildSimplePhrasePrompt,
  buildWordEntryPrompt,
  phraseFieldsInWrongScript,
  phraseLanguageReminder,
} from '../lib/translate-prompts';
import { recordLookupOutcome } from '../lib/ai-timing';
import { localizeEntry } from '../lib/localize-entry';
import { russianEnglishSlang } from '../lib/russian-english-slang';
import { PREFETCH_MAX_CANDIDATES, prefetchLocalizations } from '../lib/localize-prefetch';
import { recordStudySessionPing } from '../lib/study-session';
import { notifyGlossCapHit } from '../lib/lifecycle-email';
import {
  entitlements,
  planLimitResponse,
  type EntitlementsEngine,
  type MeteredMetric,
  type ResolvedEntitlements,
  type UsageReservation,
  selfManagedFreeAi,
} from '../lib/entitlements';
import {
  localizeDailyLimiter,
  prefetchDailyLimiter,
  translationBurstLimiter,
  type TranslationBurstKind,
  type TranslationBurstLimiter,
} from '../lib/rate-limit';

const MAX_WORD_CHARS = 128;
const MAX_PHRASE_CHARS = 256;
const MAX_SENTENCE_CHARS = 1_000;
const MAX_LANGUAGE_CHARS = 64;
const MAX_TRANSLATION_BODY_BYTES = 16 * 1024;

interface TranslateRouteDeps {
  providerForUser: (userId: string, access: ProviderAccessOptions) => LLMProvider;
  engine: EntitlementsEngine;
  rateLimiter: TranslationBurstLimiter;
  /** Daily ceiling on new localizations, on top of the per-minute burst limit. */
  dailyLocalizeLimiter?: TranslationBurstLimiter;
  /** Daily ceiling on AI translations started by lesson prefetch. */
  prefetchDailyLimiter?: TranslationBurstLimiter;
  /** Shared word-gloss cache; `null` turns it off. */
  glossCache?: GlossCache | null;
  /** Shared cache of dictionary senses translated into the learner's language; `null` turns it off. */
  entryCache?: EntryCache | null;
  /** Looks up the on-device dictionary entry; replaced in tests. */
  lookupEntry?: (
    userId: string,
    word: string,
    language: string,
  ) => ExpandedDictionaryEntry | null | undefined;
}

interface CommonInput {
  word: string;
  sentence: string;
  language?: string;
}

interface TranslationInput extends CommonInput {
  type: 'word' | 'phrase';
  explainContext: boolean;
}

/** One NDJSON line of a streamed `POST /api/translate` answer. */
type StreamLine = { delta: string } | { result: unknown } | { error: string };

interface StreamPlan {
  prompt: string;
  task: LLMTask;
  maxTokens: number;
  /** JSON keys whose string values are shown while streaming; `null` when the raw text is the answer. */
  visibleKeys: ReadonlySet<string> | null;
  finish: (provider: LLMProvider, text: string) => Promise<unknown>;
}

function parseCompleteObject(text: string): Record<string, unknown> {
  const { value, rootComplete } = parseLooseJsonResult<unknown>(text);
  if (!rootComplete || typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Model returned incomplete JSON');
  }
  return value as Record<string, unknown>;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizePhraseBreakdown(result: Record<string, unknown>): Record<string, unknown> {
  const { literalBreakdown, ...rest } = result;
  if (literalBreakdown === undefined || typeof literalBreakdown === 'string') return result;
  if (!isRecord(literalBreakdown)) return rest;

  const pairs: string[] = [];
  for (const [word, gloss] of Object.entries(literalBreakdown)) {
    if (!word.trim() || typeof gloss !== 'string' || !gloss.trim()) return rest;
    pairs.push(`${word.trim()} — ${gloss.trim()}`);
  }
  return pairs.length ? { ...rest, literalBreakdown: pairs.join('; ') } : rest;
}

async function readObject(c: Context): Promise<Parsed<Record<string, unknown>>> {
  try {
    const value: unknown = await c.req.json();
    return isRecord(value)
      ? { ok: true, value }
      : { ok: false, error: 'Request body must be a JSON object' };
  } catch {
    return { ok: false, error: 'Request body must be valid JSON' };
  }
}

function parseCommon(
  body: Record<string, unknown>,
  options: { oneToken: boolean; maxChars: number; label: 'Word' | 'Phrase' },
): Parsed<CommonInput> {
  if (typeof body.word !== 'string') {
    return { ok: false, error: `${options.label} must be a string` };
  }
  const word = body.word.trim();
  if (!word) return { ok: false, error: `${options.label} is required` };
  if (word.length > options.maxChars) {
    return { ok: false, error: `${options.label} is too long` };
  }
  if (options.oneToken && word.split(/\s+/u).length !== 1) {
    return { ok: false, error: `${options.label} must be a single token` };
  }

  if (body.sentence !== undefined && typeof body.sentence !== 'string') {
    return { ok: false, error: 'Sentence must be a string' };
  }
  const sentence = (body.sentence ?? '') as string;
  if (sentence.length > MAX_SENTENCE_CHARS) {
    return { ok: false, error: 'Sentence is too long' };
  }

  if (body.language !== undefined && typeof body.language !== 'string') {
    return { ok: false, error: 'Language must be a string' };
  }
  const language = body.language as string | undefined;
  if (language !== undefined && (language.length === 0 || language.length > MAX_LANGUAGE_CHARS)) {
    return { ok: false, error: 'Language is invalid' };
  }

  return { ok: true, value: { word, sentence, language } };
}

function parseSingleWord(body: Record<string, unknown>): Parsed<CommonInput> {
  return parseCommon(body, { oneToken: true, maxChars: MAX_WORD_CHARS, label: 'Word' });
}

function parseTranslation(body: Record<string, unknown>): Parsed<TranslationInput> {
  if (body.type !== 'word' && body.type !== 'phrase') {
    return { ok: false, error: 'Type must be exactly "word" or "phrase"' };
  }
  const common = parseCommon(body, {
    oneToken: body.type === 'word',
    maxChars: body.type === 'phrase' ? MAX_PHRASE_CHARS : MAX_WORD_CHARS,
    label: body.type === 'phrase' ? 'Phrase' : 'Word',
  });
  if (!common.ok) return common;
  const explainContext = body.explainContext === true;
  if (explainContext && (body.type !== 'word' || !common.value.sentence.trim())) {
    return { ok: false, error: 'Context explanations need a word and sentence' };
  }
  return { ok: true, value: { ...common.value, type: body.type, explainContext } };
}

function isManagedFree(resolved: ResolvedEntitlements): boolean {
  return resolved.plan === 'free' && !resolved.byok;
}

function metricForGloss(resolved: ResolvedEntitlements): MeteredMetric {
  // BYOK requests use only the high general abuse ceiling; they never consume
  // Lector-funded managed translation allowance.
  return resolved.byok ? 'llmRequestsPerMonth' : 'wordGlossesPerMonth';
}

function burstResponse(c: Context) {
  c.header('Retry-After', '60');
  return c.json({ error: 'rate_limited' as const, retryAfterSeconds: 60 }, 429);
}

function consumeFreeBurst(
  c: Context,
  limiter: TranslationBurstLimiter,
  resolved: ResolvedEntitlements,
  userId: string,
  kind: TranslationBurstKind,
): Response | null {
  if (resolved.byok || resolved.plan === 'unlimited') return null;
  return limiter.tryConsume(userId, kind) ? null : burstResponse(c);
}

function reserve(
  c: Context,
  engine: EntitlementsEngine,
  userId: string,
  metric: MeteredMetric,
): UsageReservation | Response {
  const verdict = engine.reserve(userId, metric);
  if (verdict.allowed) return verdict.reservation;
  if (metric === 'wordGlossesPerMonth' && verdict.plan === 'free') {
    void notifyGlossCapHit(userId);
  }
  return planLimitResponse(c, verdict);
}

function simpleTranslation(text: string): string {
  const translation = text.trim();
  if (!translation) throw new Error('Translation provider returned an empty response');
  if (translation.length > 512) throw new Error('Translation provider returned too much text');
  return translation;
}

// Parse a rich word-entry response and stitch the legacy translation/partOfSpeech
// fields so existing call sites that only read those don't have to change.
function stitchWordEntry(
  entry: {
    word?: string;
    senses?: Array<{ partOfSpeech: string; gloss: string }>;
    ipa?: string;
    etymology?: string;
    relatedForms?: Array<{ form: string; relation: string }>;
  },
  fallbackWord: string,
) {
  const senses: Array<{ partOfSpeech: string; gloss: string }> = Array.isArray(entry.senses)
    ? entry.senses
    : [];
  const stitchedTranslation = senses
    .map((sense) => sense.gloss)
    .filter(Boolean)
    .join('; ');

  return {
    translation: stitchedTranslation,
    partOfSpeech: senses[0]?.partOfSpeech,
    word: entry.word || fallbackWord,
    senses,
    ipa: entry.ipa,
    etymology: entry.etymology,
    relatedForms: Array.isArray(entry.relatedForms) ? entry.relatedForms : undefined,
  };
}

async function buildWordEntryResponse(
  provider: LLMProvider,
  task: Extract<LLMTask, 'word-enrichment' | 'context-rich'>,
  langName: string,
  word: string,
  sentence: string,
  nativeName: string,
) {
  const entry = await completeJson<{
    word?: string;
    senses?: Array<{ partOfSpeech: string; gloss: string }>;
    ipa?: string;
    etymology?: string;
    relatedForms?: Array<{ form: string; relation: string }>;
  }>(provider, {
    messages: [
      { role: 'user', content: buildWordEntryPrompt(langName, word, sentence, nativeName) },
    ],
    maxTokens: 1500,
    task,
  });
  return stitchWordEntry(entry, word);
}

/** The prompt carries the user's sentence, so a gloss that links or names a contact is not shared. */
function isShareableGloss(gloss: string): boolean {
  const text = gloss.trim();
  return text.length <= 60 && !/https?:|www\.|@|[a-z0-9-]\.[a-z]{2,}/i.test(text);
}

/** The client shows its own message for `content_filtered`; nothing to retry or fix in settings. */
function contentFiltered(c: Context) {
  return c.json({ error: 'content_filtered' }, 422);
}

export function makeTranslateRoutes({
  providerForUser,
  engine,
  rateLimiter,
  dailyLocalizeLimiter = localizeDailyLimiter,
  prefetchDailyLimiter: prefetchLimiter = prefetchDailyLimiter,
  glossCache = sharedGlossCache,
  entryCache = sharedEntryCache,
  lookupEntry = lookupWord,
}: TranslateRouteDeps): Hono {
  const app = new Hono();
  app.use(
    '*',
    bodyLimit({
      maxSize: MAX_TRANSLATION_BODY_BYTES,
      onError: (c) => c.json({ error: 'Translation request is too large' }, 413),
    }),
  );

  // Latency-critical residual dictionary miss. Curated/on-device hits never
  // reach this endpoint and remain unmetered.
  app.post('/gloss', async (c) => {
    const parsedBody = await readObject(c);
    if (!parsedBody.ok) return c.json({ error: parsedBody.error }, 400);
    const parsed = parseSingleWord(parsedBody.value);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);

    const userId = getCurrentUserId(c);
    const resolved = engine.resolveEntitlements(userId);
    const burst = consumeFreeBurst(c, rateLimiter, resolved, userId, 'gloss');
    if (burst) return burst;

    const lang = resolveLanguage(parsed.value.language, userId);
    const langName = getLanguageConfig(lang).name;
    const prompt = buildGlossPrompt(
      langName,
      parsed.value.word,
      parsed.value.sentence,
      getNativeLanguageName(userId),
    );
    recordStudySessionPing(userId, lang);

    // A shared hit costs nothing, so it is served before any quota is reserved.
    const nativeCode = getNativeLanguageCode(userId);
    const vetted =
      lang === 'en' && nativeCode === 'ru' ? russianEnglishSlang(parsed.value.word) : undefined;
    if (vetted) return c.text(vetted.map(({ gloss }) => gloss).join('; '));
    const cachedGloss = glossCache?.get(lang, nativeCode, parsed.value.word) ?? null;
    if (cachedGloss) {
      recordLookupOutcome('gloss', 'hit');
      return c.text(cachedGloss);
    }

    const reservation = reserve(c, engine, userId, metricForGloss(resolved));
    if (reservation instanceof Response) return reservation;
    recordLookupOutcome('gloss', 'miss');

    let provider: LLMProvider;
    try {
      provider = providerForUser(userId, { byok: reservation.byok });
    } catch (error) {
      engine.refund(reservation);
      console.error('Gloss provider error:', error);
      return c.json({ error: 'Translation failed' }, 500);
    }

    // Read the first chunk before answering so a refusal can still set the status.
    const deltas = provider
      .stream({
        messages: [{ role: 'user', content: prompt }],
        // Leave room for a short Cyrillic definition on providers that split it into more tokens.
        maxTokens: nativeCode === 'ru' ? 64 : 32,
        task: 'word-gloss',
      })
      [Symbol.asyncIterator]();
    let first: IteratorResult<string>;
    try {
      first = await deltas.next();
    } catch (error) {
      engine.refund(reservation);
      if (error instanceof LLMContentFilterError) return contentFiltered(c);
      console.error('Gloss stream error:', error);
      return c.json({ error: 'Translation failed' }, 502);
    }

    return streamText(c, async (stream) => {
      let output = '';
      try {
        for (let next = first; !next.done; next = await deltas.next()) {
          output += next.value;
          await stream.write(next.value);
        }
        if (!output.trim()) engine.refund(reservation);
        // Only server-funded answers are shared; a user's own model never writes here.
        else if (!reservation.byok && isShareableGloss(output))
          glossCache?.put(lang, nativeCode, parsed.value.word, output);
      } catch (error) {
        if (!output.trim()) engine.refund(reservation);
        console.error('Gloss stream error:', error);
      }
    });
  });

  // Dictionary senses are English. For a learner whose own language is another one,
  // translate the on-device entry's glosses once and share the result. The server
  // reads the entry itself, so a caller cannot send text of its own to the model.
  app.post('/localize', async (c) => {
    const parsedBody = await readObject(c);
    if (!parsedBody.ok) return c.json({ error: parsedBody.error }, 400);
    const parsed = parseSingleWord(parsedBody.value);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);

    const userId = getCurrentUserId(c);
    try {
      const outcome = await localizeEntry(
        {
          providerForUser,
          engine,
          rateLimiter,
          dailyLocalizeLimiter,
          entryCache,
          lookupEntry,
        },
        userId,
        parsed.value.word,
        parsed.value.language,
      );
      if (outcome.status === 'none' || outcome.status === 'miss') return c.json({ senses: null });
      if (outcome.status === 'limited') return burstResponse(c);
      return c.json({ senses: outcome.senses });
    } catch (error) {
      console.error('Localize error:', error);
      return c.json({ error: 'Translation failed' }, 502);
    }
  });

  // Warms the localize cache for words the reader may tap. The server picks the words from
  // the on-device dictionary, so a caller cannot send text of its own to the model.
  app.post('/prefetch', async (c) => {
    const parsedBody = await readObject(c);
    if (!parsedBody.ok) return c.json({ error: parsedBody.error }, 400);
    const body = parsedBody.value;
    if (!Array.isArray(body.words) || body.words.length > PREFETCH_MAX_CANDIDATES * 2) {
      return c.json({ error: 'Words must be a short list' }, 400);
    }
    const words: string[] = [];
    for (const item of body.words) {
      const parsed = parseSingleWord({ word: item });
      if (!parsed.ok) return c.json({ error: parsed.error }, 400);
      words.push(parsed.value.word);
    }
    const language = typeof body.language === 'string' ? body.language : undefined;

    try {
      const result = await prefetchLocalizations(
        {
          providerForUser,
          engine,
          rateLimiter,
          dailyLocalizeLimiter,
          prefetchDailyLimiter: prefetchLimiter,
          entryCache,
          lookupEntry,
        },
        getCurrentUserId(c),
        words,
        language,
      );
      return c.json({ senses: Object.fromEntries(result.senses) });
    } catch (error) {
      console.error('Prefetch error:', error);
      return c.json({ error: 'Prefetch failed' }, 502);
    }
  });

  // Paid or user-funded opt-in dictionary enrichment. Managed Free has a zero
  // shared-LLM allowance, so it is rejected before provider construction.
  app.post('/enrich', async (c) => {
    const parsedBody = await readObject(c);
    if (!parsedBody.ok) return c.json({ error: parsedBody.error }, 400);
    const parsed = parseSingleWord(parsedBody.value);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);

    const userId = getCurrentUserId(c);
    const lang = resolveLanguage(parsed.value.language, userId);
    const langName = getLanguageConfig(lang).name;
    const vetted =
      lang === 'en' && getNativeLanguageCode(userId) === 'ru'
        ? russianEnglishSlang(parsed.value.word)
        : undefined;
    if (vetted) {
      const verdict = engine.checkLimit(userId, 'llmRequestsPerMonth');
      if (!verdict.allowed) return planLimitResponse(c, verdict);
      return c.json(stitchWordEntry({ senses: vetted }, parsed.value.word));
    }
    const reservation = reserve(c, engine, userId, 'llmRequestsPerMonth');
    if (reservation instanceof Response) return reservation;

    try {
      const entry = await buildWordEntryResponse(
        providerForUser(userId, { byok: reservation.byok }),
        'word-enrichment',
        langName,
        parsed.value.word,
        parsed.value.sentence,
        getNativeLanguageName(userId),
      );
      return c.json(entry);
    } catch (error) {
      if (!providerAnswered(error)) engine.refund(reservation);
      if (error instanceof LLMContentFilterError) return contentFiltered(c);
      console.error('Enrich error:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Enrich failed' }, 500);
    }
  });

  app.post('/', async (c) => {
    const parsedBody = await readObject(c);
    if (!parsedBody.ok) return c.json({ error: parsedBody.error }, 400);
    const parsed = parseTranslation(parsedBody.value);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);

    const { word, sentence, language, type, explainContext } = parsed.value;
    const userId = getCurrentUserId(c);
    const resolved = engine.resolveEntitlements(userId);
    const freeOnSmallModel = isManagedFree(resolved) && selfManagedFreeAi();
    const managedFree = isManagedFree(resolved) && !freeOnSmallModel;

    if (type === 'phrase') {
      const phraseWords = word.split(/\s+/u).length;
      const phraseVerdict = engine.checkLimit(userId, 'phraseSelectionWords', phraseWords);
      if (!phraseVerdict.allowed) return planLimitResponse(c, phraseVerdict);
    }

    const burst = consumeFreeBurst(c, rateLimiter, resolved, userId, 'detail');
    if (burst) return burst;

    const lang = resolveLanguage(language, userId);
    const langConfig = getLanguageConfig(lang);
    const langName = langConfig.name;
    const nativeName = getNativeLanguageName(userId);
    recordStudySessionPing(userId, lang);

    const metric: MeteredMetric = managedFree
      ? type === 'phrase'
        ? 'phraseTranslationsPerDay'
        : 'contextTranslationsPerDay'
      : 'llmRequestsPerMonth';
    const reservation = reserve(c, engine, userId, metric);
    if (reservation instanceof Response) return reservation;

    const richPhrasePrompt = (cheapModel: boolean) => {
      const spelreels = lang === 'af' ? getSpelreelsContext() : '';
      const spelreelsSection = spelreels
        ? `Use the following official spelling rules to inform your understanding of the ${langName} input:\n\n${spelreels}\n\n---\n\n`
        : '';
      return buildPhrasePrompt(langName, spelreelsSection, word, sentence, nativeName, cheapModel);
    };
    const phraseCheapModel =
      !reservation.byok && (managedPhraseUsesCheapModel() || freeOnSmallModel);

    // Small models sometimes drift into English for the long fields.
    const finishPhrase = async (
      provider: LLMProvider,
      prompt: string,
      result: Record<string, unknown>,
    ) => {
      const answer = normalizePhraseBreakdown(result);
      const wrong = phraseFieldsInWrongScript(answer, getNativeLanguageCode(userId));
      if (wrong.length === 0) return answer;
      const retried = await completeJson<Record<string, unknown>>(provider, {
        messages: [{ role: 'user', content: prompt + phraseLanguageReminder(wrong, nativeName) }],
        maxTokens: 1500,
        task: 'phrase-rich',
      }).catch(() => null);
      return retried ? normalizePhraseBreakdown(retried) : answer;
    };

    const finishContextEntry = (entry: ReturnType<typeof stitchWordEntry>) => {
      // Keep unverified model metadata away from reviewed slang entries.
      const vetted = lang === 'en' && nativeName === 'Russian' && russianEnglishSlang(word);
      if (vetted) {
        delete entry.etymology;
        delete entry.relatedForms;
      } else if (freeOnSmallModel && !reservation.byok) {
        delete entry.etymology;
      }
      return entry;
    };

    const explanation = explainContext
      ? {
          prompt: buildContextExplanationPrompt(langName, word, sentence, nativeName),
          task: 'context-simple' as const,
          maxTokens: 192,
        }
      : null;

    const answerOnce = async (provider: LLMProvider): Promise<unknown> => {
      if (explanation) {
        const { prompt, task, maxTokens } = explanation;
        const text = await provider.complete({
          messages: [{ role: 'user', content: prompt }],
          task,
          maxTokens,
        });
        return { translation: simpleTranslation(text) };
      }

      if (managedFree) {
        const isPhrase = type === 'phrase';
        const translation = simpleTranslation(
          await provider.complete({
            messages: [
              {
                role: 'user',
                content: isPhrase
                  ? buildSimplePhrasePrompt(langName, word, sentence, nativeName)
                  : buildSimpleContextPrompt(langName, word, sentence, nativeName),
              },
            ],
            maxTokens: 96,
            task: isPhrase ? 'phrase-simple' : 'context-simple',
          }),
        );
        return { translation };
      }

      if (type === 'phrase') {
        const prompt = richPhrasePrompt(phraseCheapModel);
        const result = await completeJson<Record<string, unknown>>(provider, {
          messages: [{ role: 'user', content: prompt }],
          maxTokens: 1500,
          task: 'phrase-rich',
        });
        return finishPhrase(provider, prompt, result);
      }

      return finishContextEntry(
        await buildWordEntryResponse(
          provider,
          'context-rich',
          langName,
          word,
          sentence,
          nativeName,
        ),
      );
    };

    const streamPlan = (): StreamPlan => {
      if (explanation) {
        return {
          ...explanation,
          visibleKeys: null,
          finish: async (_provider, text) => ({ translation: simpleTranslation(text) }),
        };
      }

      if (managedFree) {
        const isPhrase = type === 'phrase';
        return {
          prompt: isPhrase
            ? buildSimplePhrasePrompt(langName, word, sentence, nativeName)
            : buildSimpleContextPrompt(langName, word, sentence, nativeName),
          task: isPhrase ? 'phrase-simple' : 'context-simple',
          maxTokens: 96,
          visibleKeys: null,
          finish: async (_provider, text) => ({ translation: simpleTranslation(text) }),
        };
      }
      if (type === 'phrase') {
        const prompt = richPhrasePrompt(phraseCheapModel);
        return {
          prompt,
          task: 'phrase-rich',
          maxTokens: 1500,
          visibleKeys: new Set(['translation']),
          finish: async (provider, text) =>
            finishPhrase(provider, prompt, parseCompleteObject(text)),
        };
      }
      return {
        prompt: buildWordEntryPrompt(langName, word, sentence, nativeName),
        task: 'context-rich',
        maxTokens: 1500,
        visibleKeys: new Set(['gloss']),
        finish: async (_provider, text) =>
          finishContextEntry(stitchWordEntry(parseCompleteObject(text), word)),
      };
    };

    // Reads the first chunk before answering so a refusal can still set the status.
    const answerStream = async (provider: LLMProvider, plan: StreamPlan) => {
      const deltas = provider
        .stream({
          messages: [{ role: 'user', content: plan.prompt }],
          maxTokens: plan.maxTokens,
          task: plan.task,
        })
        [Symbol.asyncIterator]();
      let first: IteratorResult<string>;
      try {
        first = await deltas.next();
      } catch (error) {
        engine.refund(reservation);
        if (error instanceof LLMContentFilterError) return contentFiltered(c);
        console.error('Translation stream error:', error);
        return c.json({ error: 'Translation failed' }, 502);
      }

      c.header('Content-Type', 'application/x-ndjson; charset=UTF-8');
      c.header('Cache-Control', 'no-cache, no-transform');
      return stream(c, async (out) => {
        const send = (line: StreamLine) => out.write(`${JSON.stringify(line)}\n`);
        const extractor = plan.visibleKeys ? new JsonTextExtractor(plan.visibleKeys) : null;
        let output = '';
        try {
          for (let next = first; !next.done; next = await deltas.next()) {
            output += next.value;
            const visible = extractor ? extractor.push(next.value) : next.value;
            if (visible) await send({ delta: visible });
          }
        } catch (error) {
          if (!output.trim()) engine.refund(reservation);
          console.error('Translation stream error:', error);
          await send({ error: 'Translation failed' });
          return;
        }
        if (!output.trim()) {
          engine.refund(reservation);
          await send({ error: 'Translation failed' });
          return;
        }
        try {
          // Malformed or cut-off output falls back to one complete call; the stream already billed.
          const result = await plan.finish(provider, output).catch(() => answerOnce(provider));
          await send({ result });
        } catch (error) {
          console.error('Translation error:', error);
          await send({
            error:
              error instanceof LLMContentFilterError ? 'content_filtered' : 'Translation failed',
          });
        }
      });
    };

    if (parsedBody.value.stream === true) {
      const plan = streamPlan();
      let provider: LLMProvider;
      try {
        provider = providerForUser(userId, { byok: reservation.byok });
      } catch (error) {
        engine.refund(reservation);
        console.error('Translation provider error:', error);
        return c.json({ error: 'Translation failed' }, 500);
      }
      return answerStream(provider, plan);
    }

    try {
      const provider = providerForUser(userId, { byok: reservation.byok });
      return c.json(await answerOnce(provider));
    } catch (error) {
      if (!providerAnswered(error)) engine.refund(reservation);
      if (error instanceof LLMContentFilterError) return contentFiltered(c);
      console.error('Translation error:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Translation failed' }, 500);
    }
  });

  return app;
}

export default makeTranslateRoutes({
  providerForUser: getProvider,
  engine: entitlements,
  rateLimiter: translationBurstLimiter,
});
