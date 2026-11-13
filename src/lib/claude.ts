import { getActiveLanguage } from './data-layer';
import { apiFetch } from './api-base';
import { AI_USAGE_EVENT } from '@/constants/storage';
import { readTranslateStream } from './translate-stream';

function noteAiUsage(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(AI_USAGE_EVENT));
}

// Types
export interface WordTranslation {
  /** Legacy: stitched single-string translation (sense glosses joined "; "). */
  translation: string;
  /** Legacy: first sense's POS. */
  partOfSpeech?: string;
  /** Structured fields used by the drawer + the on-device cache. */
  word?: string;
  senses?: Array<{ partOfSpeech: string; gloss: string }>;
  ipa?: string;
  etymology?: string;
  relatedForms?: Array<{ form: string; relation: string }>;
}

export interface PhraseTranslation {
  translation: string;
  literalBreakdown?: string;
  idiomaticMeaning?: string;
  usageNotes?: string;
  register?: 'formal' | 'informal' | 'literary' | 'colloquial' | 'archaic' | 'neutral';
}

/** Error message thrown when the AI provider's moderation refused the passage. */
export const CONTENT_FILTERED = 'content_filtered';

async function failureMessage(response: Response): Promise<string> {
  const error = await response.json().catch(() => ({}));
  return error.error || 'Translation failed';
}

/**
 * POST /api/translate. With `onText` the answer streams: the callback gets the visible text
 * so far and the promise resolves with the final result. A plain JSON reply is read as before.
 */
async function postTranslate<T>(
  body: Record<string, unknown>,
  onText?: (cumulative: string) => void,
): Promise<T> {
  const init = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
  let response: Response;
  if (onText) {
    try {
      response = await apiFetch('/api/translate', {
        ...init,
        body: JSON.stringify({ ...body, stream: true }),
      });
    } catch (error) {
      if (error instanceof TypeError) return postTranslate<T>(body);
      throw error;
    }
  } else {
    response = await apiFetch('/api/translate', { ...init, body: JSON.stringify(body) });
  }

  if (!response.ok) throw new Error(await failureMessage(response));

  const streamed = response.headers.get('content-type')?.includes('application/x-ndjson');
  const result =
    onText && streamed && response.body
      ? await readTranslateStream<T>(response.body, onText)
      : ((await response.json()) as T);
  noteAiUsage();
  return result;
}

/**
 * Translate a single word with surrounding sentence context
 * @param word - The word to translate
 * @param sentence - The full sentence containing the word (for context)
 * @returns Translation with optional part of speech
 */
export async function translateWord(
  word: string,
  sentence: string,
  onText?: (cumulative: string) => void,
): Promise<WordTranslation> {
  return postTranslate<WordTranslation>(
    { word, sentence, type: 'word', language: getActiveLanguage() },
    onText,
  );
}

export function explainWordInContext(word: string, sentence: string): Promise<WordTranslation> {
  return postTranslate<WordTranslation>({
    word,
    sentence,
    type: 'word',
    explainContext: true,
    language: getActiveLanguage(),
  });
}

/**
 * Fast-path word gloss — streams a plain-text translation so the reader sees
 * the meaning form as it generates instead of waiting for a full structured
 * entry. Calls `onDelta` with the cumulative text on every chunk and resolves
 * with the final trimmed gloss. Throws if the stream yields nothing (so the
 * caller can show an error / fall back).
 *
 * Pair with `enrichWord` for the opt-in rich entry (senses / IPA / etymology).
 */
export async function streamWordGloss(
  word: string,
  sentence: string,
  onDelta: (cumulative: string) => void,
): Promise<string> {
  const response = await apiFetch('/api/translate/gloss', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word, sentence, language: getActiveLanguage() }),
  });

  if (!response.ok || !response.body) {
    let message = 'Translation failed';
    try {
      const error = await response.json();
      message = error.error || message;
    } catch {
      /* non-JSON error body — keep the default */
    }
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onDelta(text);
  }
  text += decoder.decode();
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Translation failed');
  noteAiUsage();
  onDelta(trimmed);
  return trimmed;
}

/**
 * Minimal managed dictionary-miss lookup for non-streaming surfaces such as
 * Practice. It intentionally uses the same cheap `/gloss` operation as the
 * Reader rather than spending an in-context/rich translation allowance.
 */
export async function translateGloss(word: string, sentence: string): Promise<WordTranslation> {
  const translation = await streamWordGloss(word, sentence, () => {});
  return { translation };
}

/**
 * Opt-in rich dictionary entry for a word (senses, IPA, etymology, related
 * forms) — the "enrich" action behind the streamed gloss. Same shape as
 * translateWord; hits the dedicated /enrich endpoint.
 */
export async function enrichWord(word: string, sentence: string): Promise<WordTranslation> {
  const response = await apiFetch('/api/translate/enrich', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word, sentence, language: getActiveLanguage() }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Enrich failed');
  }

  noteAiUsage();
  return response.json();
}

/**
 * Translate a phrase with surrounding sentence context
 * @param phrase - The phrase to translate
 * @param sentence - The full sentence containing the phrase (for context)
 * @returns Translation with optional literal breakdown and idiomatic meaning
 */
export async function translatePhrase(
  phrase: string,
  sentence: string,
  onText?: (cumulative: string) => void,
): Promise<PhraseTranslation> {
  return postTranslate<PhraseTranslation>(
    { word: phrase, sentence, type: 'phrase', language: getActiveLanguage() },
    onText,
  );
}
