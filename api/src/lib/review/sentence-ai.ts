import { completeJson, type LLMProvider, type ProviderAccessOptions } from '../llm';
import { LANGUAGES, isValidLanguageCode, nativeLanguageName } from '../languages';
import type { EntitlementsEngine } from '../entitlements';
import type { TranslationBurstLimiter } from '../rate-limit';
import { buildExampleSentencePrompt, buildSentenceTranslationPrompt } from '../translate-prompts';
import {
  isCacheableExample,
  type ExampleSentence,
  type ExampleSentenceCache,
} from '../example-sentence-cache';
import {
  isCacheableSentenceTranslation,
  MAX_SOURCE_SENTENCE_CHARS,
  type SentenceTranslationCache,
} from '../sentence-translation-cache';
import {
  blankIn,
  type FoundSentence,
  type SentenceBlank,
  type SentenceDeps,
  type SentenceRequest,
} from './sentence-sources';

export const AI_SENTENCE_KEY = 'ai';

export interface SentenceAiDeps {
  providerForUser: (userId: string, access: ProviderAccessOptions) => LLMProvider;
  /** Only `resolveEntitlements` is reachable: these paths never reserve an allowance. */
  engine: Pick<EntitlementsEngine, 'resolveEntitlements'>;
  rateLimiter: TranslationBurstLimiter;
  dailyLimiter: TranslationBurstLimiter;
  translations: SentenceTranslationCache;
  examples: ExampleSentenceCache;
  sentenceDeps?: Pick<SentenceDeps, 'forms'>;
}

export type ExampleRequest = Pick<SentenceRequest, 'word' | 'type' | 'language'>;

export interface GeneratedExample {
  sentence: string;
  translation: string | null;
  blank: SentenceBlank;
}

function languageKey(code: string): string {
  const lower = code.toLowerCase();
  return lower.startsWith('zh') ? 'zh-cn' : lower;
}

export function sameLanguage(a: string, b: string): boolean {
  return languageKey(a) === languageKey(b);
}

/** A bundled or already-shared translation, with no provider call. `pending` means a request could fill it. */
export function sentenceTranslationFor(
  found: Pick<FoundSentence, 'text' | 'source' | 'translation'>,
  language: string,
  native: string,
  cache: SentenceTranslationCache,
): { translation?: { text: string; lang: string }; pending: boolean } {
  if (found.source.kind === 'saved' || sameLanguage(language, native)) return { pending: false };
  if (found.translation && sameLanguage(found.translation.lang, native)) {
    return { translation: found.translation, pending: false };
  }
  const shared = cache.get(language, native, found.text);
  if (shared !== null) return { translation: { text: shared, lang: native }, pending: false };
  return { pending: found.text.length <= MAX_SOURCE_SENTENCE_CHARS };
}

export function exampleAsFound(example: GeneratedExample): FoundSentence {
  return {
    key: AI_SENTENCE_KEY,
    text: example.sentence,
    wordCount: example.sentence.split(/\s+/).length,
    blank: example.blank,
    source: { kind: 'ai' },
    ...(example.translation ? { translation: { text: example.translation, lang: 'en' } } : {}),
  };
}

export function cachedExample(
  deps: Pick<SentenceAiDeps, 'examples' | 'sentenceDeps'>,
  request: ExampleRequest,
): GeneratedExample | null {
  const hit = deps.examples.get(request.language, request.word);
  if (!hit) return null;
  const blank = blankIn(request, hit.sentence, deps.sentenceDeps);
  return blank ? { ...hit, blank } : null;
}

/** False when the learner's own provider is not in play and a burst limit is reached. */
function mayRequest(deps: SentenceAiDeps, userId: string, byok: boolean): boolean {
  return (
    byok ||
    (deps.rateLimiter.tryConsume(userId, 'localize') &&
      deps.dailyLimiter.tryConsume(userId, 'localize'))
  );
}

const UNSHAREABLE = /https?:|www\.|@/i;

/**
 * Translate a non-learner sentence into the learner's own language. Reads the shared
 * cache first, then asks the provider. A managed answer is stored; a BYOK answer is not.
 * Returns null on any failure or when a burst limit is reached.
 */
export async function translateSentence(
  deps: SentenceAiDeps,
  userId: string,
  language: string,
  native: string,
  text: string,
): Promise<{ text: string; lang: string } | null> {
  if (sameLanguage(language, native) || !isValidLanguageCode(language)) return null;
  const shared = deps.translations.get(language, native, text);
  if (shared !== null) return { text: shared, lang: native };
  if (text.length > MAX_SOURCE_SENTENCE_CHARS) return null;
  const byok = deps.engine.resolveEntitlements(userId).byok;
  if (!mayRequest(deps, userId, byok)) return null;
  try {
    const result = await completeJson<{ translation?: unknown }>(
      deps.providerForUser(userId, { byok }),
      {
        messages: [
          {
            role: 'user',
            content: buildSentenceTranslationPrompt(
              LANGUAGES[language].name,
              nativeLanguageName(native),
              text,
            ),
          },
        ],
        maxTokens: 400,
        task: 'sentence-translation',
      },
    );
    if (
      typeof result.translation !== 'string' ||
      !isCacheableSentenceTranslation(result.translation)
    ) {
      return null;
    }
    const translation = result.translation.trim();
    if (!byok) deps.translations.put(language, native, text, translation);
    return { text: translation, lang: native };
  } catch (error) {
    console.error('Sentence translation error:', error);
    return null;
  }
}

/**
 * One AI example sentence per (language, word), shared by every learner. Only the word
 * and the language go to the provider. A sentence without the word as a whole token is dropped.
 */
export async function generateExample(
  deps: SentenceAiDeps,
  userId: string,
  request: ExampleRequest,
): Promise<GeneratedExample | null> {
  if (request.type === 'phrase' || !isValidLanguageCode(request.language)) return null;
  const shared = cachedExample(deps, request);
  if (shared) return shared;
  const byok = deps.engine.resolveEntitlements(userId).byok;
  if (!mayRequest(deps, userId, byok)) return null;
  try {
    const result = await completeJson<{ sentence?: unknown; translation?: unknown }>(
      deps.providerForUser(userId, { byok }),
      {
        messages: [
          {
            role: 'user',
            content: buildExampleSentencePrompt(LANGUAGES[request.language].name, request.word),
          },
        ],
        maxTokens: 300,
        task: 'example-sentence',
      },
    );
    if (typeof result.sentence !== 'string') return null;
    const example: ExampleSentence = {
      sentence: result.sentence.trim(),
      translation:
        typeof result.translation === 'string' && result.translation.trim() !== ''
          ? result.translation.trim()
          : null,
    };
    if (!isCacheableExample(example) || UNSHAREABLE.test(example.sentence)) return null;
    const blank = blankIn(request, example.sentence, deps.sentenceDeps);
    if (!blank) return null;
    if (!byok) deps.examples.put(request.language, request.word, example);
    return { ...example, blank };
  } catch (error) {
    console.error('Example sentence error:', error);
    return null;
  }
}
