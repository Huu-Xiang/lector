import type { AtomicLimitCheck, LimitMetric } from './entitlements';
import type { VocabTranslationSource } from '../db';

export const MAX_PERSISTED_ID_BYTES = 128;
const ID_CONTROL_CHARACTERS = /[\u0000-\u001f]/;
const NON_PORTABLE_TEXT_CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;

export const VOCAB_TRANSLATION_SOURCES = new Set<VocabTranslationSource>([
  'dictionary',
  'ai_context',
  'ai_retranslate',
  'ai_phrase',
  'manual',
]);

export const PHRASE_DETAIL_REGISTERS = new Set([
  'formal',
  'informal',
  'literary',
  'colloquial',
  'archaic',
  'neutral',
  'slang',
] as const);

export type PhraseDetailRegister =
  typeof PHRASE_DETAIL_REGISTERS extends ReadonlySet<infer T> ? T : never;

export interface PhraseDetails {
  literalBreakdown?: string;
  idiomaticMeaning?: string;
  usageNotes?: string;
  register?: PhraseDetailRegister;
}

export const PHRASE_DETAILS_MAX_BYTES = {
  literalBreakdown: 512,
  idiomaticMeaning: 512,
  usageNotes: 512,
  register: 32,
} as const;

const ALLOWED_PHRASE_DETAIL_KEYS = new Set<string>(Object.keys(PHRASE_DETAILS_MAX_BYTES));

export function validateTranslationSource(
  value: unknown,
): { ok: true; value: VocabTranslationSource | null | undefined } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null) return { ok: true, value: null };
  if (typeof value === 'string' && VOCAB_TRANSLATION_SOURCES.has(value as VocabTranslationSource)) {
    return { ok: true, value: value as VocabTranslationSource };
  }
  return { ok: false, error: 'translationSource is invalid' };
}

/**
 * Validate and serialize structured `phraseDetails` into a canonical JSON string
 * (or `null` when empty/cleared). Enforces the strict 4-key allowlist, per-field
 * UTF-8 byte caps on all plans, register enum membership, and C0 control stripping
 * BEFORE `vocabContentBytes()` runs so object inputs can never bypass byte caps.
 */
export function validateAndSerializePhraseDetails(
  value: unknown,
  options: { allowJsonString?: boolean } = {},
): { ok: true; value: string | null | undefined } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null) return { ok: true, value: null };

  let raw: unknown = value;
  if (typeof value === 'string') {
    if (!options.allowJsonString) {
      return { ok: false, error: 'phraseDetails must be an object or null' };
    }
    try {
      raw = JSON.parse(value);
    } catch {
      return { ok: false, error: 'phraseDetails must be valid JSON' };
    }
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'phraseDetails must be an object or null' };
  }

  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_PHRASE_DETAIL_KEYS.has(key)) {
      return { ok: false, error: `phraseDetails contains unknown field: ${key}` };
    }
  }

  const cleaned: PhraseDetails = {};
  for (const field of ['literalBreakdown', 'idiomaticMeaning', 'usageNotes'] as const) {
    const fieldVal = record[field];
    if (fieldVal === undefined || fieldVal === null) continue;
    if (typeof fieldVal !== 'string') {
      return { ok: false, error: `phraseDetails.${field} must be a string` };
    }
    const sanitized = fieldVal.replace(NON_PORTABLE_TEXT_CONTROLS, '').trim();
    if (!sanitized) continue;
    const cap = PHRASE_DETAILS_MAX_BYTES[field];
    if (utf8Bytes(sanitized) > cap) {
      return { ok: false, error: `phraseDetails.${field} exceeds ${cap} UTF-8 bytes` };
    }
    cleaned[field] = sanitized;
  }

  const registerVal = record.register;
  if (registerVal !== undefined && registerVal !== null) {
    if (typeof registerVal !== 'string') {
      return { ok: false, error: 'phraseDetails.register must be a string' };
    }
    const sanitized = registerVal.replace(NON_PORTABLE_TEXT_CONTROLS, '').trim();
    if (sanitized) {
      if (
        utf8Bytes(sanitized) > PHRASE_DETAILS_MAX_BYTES.register ||
        !PHRASE_DETAIL_REGISTERS.has(sanitized as PhraseDetailRegister)
      ) {
        return { ok: false, error: 'phraseDetails.register is invalid' };
      }
      cleaned.register = sanitized as PhraseDetailRegister;
    }
  }

  if (Object.keys(cleaned).length === 0) return { ok: true, value: null };
  return { ok: true, value: JSON.stringify(cleaned) };
}

/** Deserialize a stored `vocab.phraseDetails` JSON string into a clean object, or `undefined`. */
export function parsePhraseDetails(raw: string | null | undefined): PhraseDetails | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
    const record = parsed as Record<string, unknown>;
    const out: PhraseDetails = {};
    for (const field of ['literalBreakdown', 'idiomaticMeaning', 'usageNotes'] as const) {
      const val = record[field];
      if (typeof val === 'string' && val.trim()) out[field] = val;
    }
    if (
      typeof record.register === 'string' &&
      PHRASE_DETAIL_REGISTERS.has(record.register as PhraseDetailRegister)
    ) {
      out.register = record.register as PhraseDetailRegister;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

export function validatePersistedId(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return 'id must be a non-empty string';
  if (ID_CONTROL_CHARACTERS.test(value)) return 'id must not contain control characters';
  if (utf8Bytes(value) > MAX_PERSISTED_ID_BYTES) {
    return `id exceeds the ${MAX_PERSISTED_ID_BYTES}-byte persisted-id limit`;
  }
  return null;
}

/** SQLite stores TEXT as UTF-8. Buffer.byteLength therefore matches
 * `length(CAST(column AS BLOB))`, which the entitlement engine uses for live
 * aggregate usage. Keeping both sides on bytes avoids multi-byte Unicode
 * slipping past a character-count boundary. */
export function utf8Bytes(value: unknown): number {
  return Buffer.byteLength(typeof value === 'string' ? value : '', 'utf8');
}

export function lessonTextBytes(textContent: unknown, title?: unknown): number {
  return utf8Bytes(textContent) + utf8Bytes(title);
}

export function collectionMetadataBytes(input: {
  title?: unknown;
  author?: unknown;
  coverUrl?: unknown;
}): number {
  return utf8Bytes(input.title) + utf8Bytes(input.author) + utf8Bytes(input.coverUrl);
}

export function vocabContentBytes(input: {
  text?: unknown;
  sentence?: unknown;
  translation?: unknown;
  phraseDetails?: unknown;
}): number {
  return (
    utf8Bytes(input.text) +
    utf8Bytes(input.sentence) +
    utf8Bytes(input.translation) +
    utf8Bytes(input.phraseDetails)
  );
}

export function clozeContentBytes(input: {
  sentence?: unknown;
  clozeWord?: unknown;
  translation?: unknown;
}): number {
  return utf8Bytes(input.sentence) + utf8Bytes(input.clozeWord) + utf8Bytes(input.translation);
}

export function journalContentBytes(input: {
  body?: unknown;
  correctedBody?: unknown;
  corrections?: unknown;
}): number {
  return utf8Bytes(input.body) + utf8Bytes(input.correctedBody) + utf8Bytes(input.corrections);
}

export function ankiPendingContentBytes(input: {
  word?: unknown;
  sentence?: unknown;
  translation?: unknown;
  meaning?: unknown;
  sourceUrl?: unknown;
}): number {
  return (
    utf8Bytes(input.word) +
    utf8Bytes(input.sentence) +
    utf8Bytes(input.translation) +
    utf8Bytes(input.meaning) +
    utf8Bytes(input.sourceUrl)
  );
}

export interface AcceptedDictionaryContent {
  word: string;
  senses: Array<{ partOfSpeech?: string; gloss: string }>;
  ipa?: string;
  etymology?: string;
  sourceSentence?: string;
  relatedForms?: Array<{ form: string; relation: string }>;
}

export function acceptedDictionaryContentBytes(input: AcceptedDictionaryContent): number {
  return (
    utf8Bytes(input.word) +
    utf8Bytes(input.ipa) +
    utf8Bytes(input.etymology) +
    utf8Bytes(input.sourceSentence) +
    input.senses.reduce(
      (total, sense) => total + utf8Bytes(sense.partOfSpeech) + utf8Bytes(sense.gloss),
      0,
    ) +
    (input.relatedForms ?? []).reduce(
      (total, related) => total + utf8Bytes(related.form) + utf8Bytes(related.relation),
      0,
    )
  );
}

/** Add a direct per-row size check only when a write grows that row. This is
 * the compatibility carve-out for legacy oversized rows: same-size restores
 * and shrinking edits remain possible after downgrade. */
export function growingRowCheck(
  metric: LimitMetric,
  nextBytes: number,
  previousBytes = 0,
): AtomicLimitCheck[] {
  return nextBytes > previousBytes ? [{ metric, requested: nextBytes }] : [];
}

/** Add an aggregate live-byte check only for positive growth. Non-increasing
 * updates remain usable even while existing data is above a new Free cap. */
export function aggregateGrowthCheck(
  metric: LimitMetric,
  nextBytes: number,
  previousBytes = 0,
): AtomicLimitCheck[] {
  const growth = nextBytes - previousBytes;
  return growth > 0 ? [{ metric, requested: growth }] : [];
}

export function batchGrowthCheck(growthBytes: number): AtomicLimitCheck[] {
  return growthBytes > 0 ? [{ metric: 'maxWriteBatchBytes', requested: growthBytes }] : [];
}
