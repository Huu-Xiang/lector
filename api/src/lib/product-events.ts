import { existsSync } from 'node:fs';
import path from 'node:path';
import { LANGUAGES } from './languages';
import { isLang, isSource, PRODUCT_CAMPAIGNS, PRODUCT_UI_LANGUAGES } from './source-list';

export interface ProductEvent {
  event: string;
  language?: string;
  feature?: string;
  outcome?: string;
  step?: string;
  value?: number;
  lessonId?: string;
  roundId?: string;
  publicBook?: string;
  source?: string;
  browserLanguage?: string;
  uiLanguage?: string;
  campaign?: string;
  latencyMs?: number;
  tokenInput?: number;
  tokenOutput?: number;
  tokenTotal?: number;
}

const pageKinds = [
  'landing',
  'books',
  'book',
  'book_preview',
  'vocab_test',
  'pricing',
  'register',
  'books_language',
  'books_level',
  'reading_list',
  'checkout',
];
const importKinds = ['epub', 'markdown', 'audio', 'paste', 'web', 'youtube', 'text', 'url'];
const readerKinds = [
  'word',
  'phrase',
  'context',
  'listen_along',
  'listen',
  'sentence',
  'explain',
  'enrich',
];
const results = ['started', 'success', 'failure', 'error'];
const attempts = [
  'lookup',
  'gloss',
  'localize',
  'prefetch',
  'phrase',
  'context',
  'enrich',
  'chat',
  'other',
];
const quizEvents = [
  'quiz_started',
  'quiz_progress',
  'quiz_finished',
  'quiz_level_applied',
  'quiz_book_opened',
];
const currencies =
  'USD EUR GBP JPY CAD AUD CHF HKD SGD SEK NOK DKK PLN MXN BRL CNY CZK HUF ILS INR KRW NZD ZAR ARS COP UAH CLP PEN THB TRY TWD VND'.split(
    ' ',
  );
const quotaMetrics = [
  'llmRequestsPerMonth',
  'ttsCharsPerMonth',
  'wordGlossesPerMonth',
  'phraseTranslationsPerDay',
  'contextTranslationsPerDay',
  'audioTranscriptionMinutesPerMonth',
  'journalWordsPerMonth',
];

type Rule = readonly string[] | ((value: unknown) => boolean);
type Rules = Partial<Record<Exclude<keyof ProductEvent, 'event'>, Rule>>;

const number =
  (max: number) =>
  (value: unknown): boolean =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;

export function validProductId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,240}$/.test(value);
}

function language(value: unknown): boolean {
  return typeof value === 'string' && Object.hasOwn(LANGUAGES, value);
}

export function isProductPublicBook(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 140) return false;
  const match = /^([a-z]{2,3})\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(value);
  if (!match || !language(match[1])) return false;
  const root =
    process.env.LIBRARY_CONTENT_ROOT || path.resolve(import.meta.dir, '../../../languages');
  return existsSync(path.join(root, match[1], 'content', 'library', match[2], 'manifest.json'));
}

const attribution: Rules = {
  source: (value) => value === 'unknown' || isSource(value),
  browserLanguage: isLang,
  uiLanguage: PRODUCT_UI_LANGUAGES,
  campaign: PRODUCT_CAMPAIGNS,
};
const lesson: Rules = { language, lessonId: validProductId };
const review: Rules = { language, roundId: validProductId, value: number(1000) };
const quiz: Rules = { language: ['en'] };
const payment: Rules = { feature: ['xiaodou', 'paddle'], step: currencies, value: number(1e12) };
const reviewAnswer: Rules = {
  language,
  feature: ['choose_meaning', 'recognition', 'fill_in', 'typed_fill_in', 'dictation'],
  outcome: ['again', 'hard', 'good'],
  step: ['new', 'lt_1d', '1_7d', '8_30d', 'gt_30d'],
};
const client: Record<string, Rules> = {
  page_view: {
    ...attribution,
    feature: pageKinds,
    language,
    step: ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'],
    publicBook: isProductPublicBook,
  },
  reading_opened: lesson,
  reading_started: lesson,
  reading_time: { ...lesson, value: number(60) },
  reading_progress: { ...lesson, value: (value) => [25, 50, 75, 90].includes(value as number) },
  reading_completed: lesson,
  reading_difficulty: { ...lesson, outcome: ['too_easy', 'just_right', 'too_hard'] },
  word_lookup: { ...lesson, feature: readerKinds },
  word_saved: { ...lesson, feature: readerKinds },
  reading_help: { ...lesson, feature: readerKinds, outcome: results },
  audio_started: { ...lesson, feature: readerKinds },
  audio_finished: { ...lesson, feature: readerKinds, outcome: results },
  content_selected: {
    language,
    feature: ['recommendation', 'library', 'feed'],
    publicBook: isProductPublicBook,
  },
  review_opened: { language, outcome: ['available', 'empty'], value: number(1000) },
  review_started: review,
  review_completed: review,
  quiz_started: quiz,
  quiz_progress: { ...quiz, value: (value) => [1, 8, 20, 40, 80, 120].includes(value as number) },
  quiz_finished: { ...quiz, value: number(120) },
  quiz_level_applied: quiz,
  quiz_book_opened: { ...quiz, publicBook: isProductPublicBook },
  import_started: { language, feature: importKinds },
  import_finished: { language, feature: importKinds, outcome: results },
};
const server: Record<string, Rules> = {
  ...client,
  registration_started: attribution,
  signup_created: attribution,
  signup_verified: {},
  onboarding_started: { language },
  onboarding_finished: { language, outcome: ['completed', 'skipped', 'dismissed'] },
  reading_resumed: lesson,
  review_answer: reviewAnswer,
  review_undo: reviewAnswer,
  report_saved: quiz,
  report_delivery: {
    ...quiz,
    outcome: ['pending', 'sending', 'sent', 'failed', 'held', 'unavailable', 'skipped', 'unknown'],
  },
  checkout_started: { ...payment, outcome: ['alipay', 'wechat'] },
  payment_succeeded: { ...payment, outcome: ['alipay', 'wechat'] },
  payment_failed: { ...payment, outcome: ['amount_mismatch', 'checkout_error', 'declined'] },
  payment_refunded: { ...payment, outcome: ['refund', 'chargeback'] },
  payment_canceled: { ...payment, outcome: ['transaction', 'subscription'] },
  quota_hit: { feature: quotaMetrics },
  ai_cache: { feature: attempts, outcome: ['hit', 'miss'] },
  ai_first_token: { feature: attempts, latencyMs: number(3600000) },
  ai_attempt: {
    feature: attempts,
    outcome: ['success', 'error', 'timeout'],
    step: ['retry'],
    latencyMs: number(3600000),
    tokenInput: number(1e9),
    tokenOutput: number(1e9),
    tokenTotal: number(1e9),
  },
};

function parse(value: unknown, rules: Record<string, Rules>): ProductEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.event !== 'string' || !Object.hasOwn(rules, body.event)) return null;
  const rule = rules[body.event];
  const event: ProductEvent = { event: body.event };
  for (const [key, input] of Object.entries(body)) {
    if (key === 'event' || input === undefined) continue;
    if (!Object.hasOwn(rule, key)) return null;
    const allowed = rule[key as keyof Rules];
    const valid =
      typeof allowed === 'function' ? allowed(input) : allowed?.includes(input as string);
    if (!valid) return null;
    Object.assign(event, { [key]: input });
  }
  return event;
}

export function parseProductEvent(value: unknown, anonymous: boolean): ProductEvent | null {
  const event = parse(value, client);
  if (!event) return null;
  if (anonymous && event.event !== 'page_view' && !quizEvents.includes(event.event)) return null;
  if (
    (event.event.startsWith('reading_') ||
      event.event.startsWith('word_') ||
      event.event.startsWith('audio_')) &&
    !event.lessonId
  )
    return null;
  if (event.event === 'page_view' && !event.feature) return null;
  if ((event.event === 'review_started' || event.event === 'review_completed') && !event.roundId)
    return null;
  if (
    ['reading_time', 'reading_progress', 'quiz_progress', 'quiz_finished'].includes(event.event) &&
    event.value === undefined
  )
    return null;
  if (
    ['reading_difficulty', 'audio_finished', 'import_finished', 'review_opened'].includes(
      event.event,
    ) &&
    !event.outcome
  )
    return null;
  return event;
}

export function validateProductEvent(event: ProductEvent): ProductEvent | null {
  return parse(event, server);
}
