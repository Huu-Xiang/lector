import { ExpandedDictionaryEntry } from '@/lib/dictionary-client';
import {
  AiPhraseDetails,
  PhraseRegister,
  VocabEntry,
  VocabTranslationSource,
  WordState,
} from '@/types';

export interface WordPanelState {
  isOpen: boolean;
  word: string;
  /** Explicit phrase marker from MarkdownReader so unspaced scripts (zh/ja) work without ASCII spaces. */
  isPhrase?: boolean;
  sentence: string;
  translation: string | null;
  translationLang?: string | null;
  translationSource?: VocabTranslationSource | null;
  /** Persisted AI/manual meaning hydrated from `existingEntry` when it matches
      the active explanation language. Kept distinct from live `aiContextTranslation`
      so "In context" remains available when opening the word in another sentence. */
  savedAiTranslation: string | null;
  savedTranslationSource: VocabTranslationSource | null;
  savedSentence: string | null;
  partOfSpeech: string | null;
  dictEntry: ExpandedDictionaryEntry | null;
  /** Active AI-in-context override translation from the current drawer session. */
  aiContextTranslation: string | null;
  /** Structured AI translation (from /api/translate). Populated whenever the AI
      returns multi-sense output, regardless of which translation is shown. Used
      to persist the entry into the on-device cache when the user accepts
      (Save / Known / level). Distinct from `dictEntry` so we can tell a kaikki
      dict hit from an AI cacheable result. */
  aiStructured: {
    senses: Array<{ partOfSpeech: string; gloss: string }>;
    ipa?: string;
    etymology?: string;
    relatedForms?: Array<{ form: string; relation: string }>;
  } | null;
  phraseDetails: AiPhraseDetails | null;
  isLoading: boolean;
  isContextLoading: boolean;
  /** True while the fast-path gloss is still streaming in token-by-token. */
  isStreamingGloss: boolean;
  /** True while the opt-in rich "enrich" lookup is in flight. */
  isEnriching: boolean;
  isDictionaryResult: boolean;
  error: string | null;
  existingEntry: VocabEntry | null;
}

const SAVED_AI_TRANSLATION_SOURCES: ReadonlySet<VocabTranslationSource> = new Set([
  'ai_context',
  'ai_retranslate',
  'manual',
]);

const VALID_PHRASE_REGISTERS: ReadonlySet<PhraseRegister> = new Set([
  'formal',
  'informal',
  'literary',
  'colloquial',
  'archaic',
  'neutral',
  'slang',
]);

export function isSavedAiTranslationSource(
  source: VocabTranslationSource | null | undefined,
): source is 'ai_context' | 'ai_retranslate' | 'manual' {
  return !!source && SAVED_AI_TRANSLATION_SOURCES.has(source);
}

export function normalizePhraseDetails(
  raw:
    | {
        literalBreakdown?: string;
        idiomaticMeaning?: string;
        usageNotes?: string;
        register?: string;
      }
    | null
    | undefined,
): AiPhraseDetails | null {
  if (!raw) return null;
  const details: AiPhraseDetails = {};
  if (raw.literalBreakdown?.trim()) details.literalBreakdown = raw.literalBreakdown.trim();
  if (raw.idiomaticMeaning?.trim()) details.idiomaticMeaning = raw.idiomaticMeaning.trim();
  if (raw.usageNotes?.trim()) details.usageNotes = raw.usageNotes.trim();
  const normalizedRegister = raw.register?.trim().toLowerCase();
  if (normalizedRegister && VALID_PHRASE_REGISTERS.has(normalizedRegister as PhraseRegister)) {
    details.register = normalizedRegister as PhraseRegister;
  }
  return Object.keys(details).length > 0 ? details : null;
}

export function hydrateExistingVocab(
  prev: WordPanelState,
  existingEntry: VocabEntry | undefined,
  isPhrase: boolean,
  hasTranslation: boolean,
): WordPanelState {
  const hasSavedAiWordMeaning =
    !isPhrase && hasTranslation && isSavedAiTranslationSource(existingEntry?.translationSource);
  const hydratedPhraseDetails =
    isPhrase && hasTranslation ? normalizePhraseDetails(existingEntry?.phraseDetails) : null;

  return {
    ...prev,
    translation: hasTranslation && existingEntry ? existingEntry.translation : null,
    translationLang:
      hasTranslation && existingEntry ? (existingEntry.translationLang ?? null) : null,
    translationSource:
      hasTranslation && existingEntry ? (existingEntry.translationSource ?? null) : null,
    savedAiTranslation: hasSavedAiWordMeaning && existingEntry ? existingEntry.translation : null,
    savedTranslationSource:
      hasSavedAiWordMeaning && existingEntry ? (existingEntry.translationSource ?? null) : null,
    savedSentence: hasSavedAiWordMeaning && existingEntry ? existingEntry.sentence : null,
    phraseDetails: hydratedPhraseDetails,
    isLoading: !hasTranslation,
    existingEntry: existingEntry ?? null,
  };
}

export function shouldPersistImmediateAiUpdate(
  existing: VocabEntry | undefined,
): existing is VocabEntry {
  return !!existing && existing.state !== 'new';
}

/**
 * Automatic phrase lookup on click must never silently overwrite an existing
 * saved phrase whose meaning belongs to another explanation language (e.g. a
 * Chinese saved phrase clicked after enabling monolingual mode). It may persist
 * only when:
 * - the phrase did not exist before this lookup and auto-save just created a
 *   brand-new saved row mid-stream (attaching `phraseDetails` to that row), OR
 * - `canAutoReplace` explicitly allows repairing a stale/empty fallback row.
 */
export function shouldPersistAutoPhraseLookup(
  initialExisting: VocabEntry | undefined,
  latestExisting: VocabEntry | undefined,
  canAutoReplace: boolean,
): latestExisting is VocabEntry {
  if (!latestExisting) return false;
  if (!initialExisting) return shouldPersistImmediateAiUpdate(latestExisting);
  return canAutoReplace;
}

export function isPhrasePanel(panel: Pick<WordPanelState, 'word' | 'isPhrase'>): boolean {
  return panel.isPhrase ?? panel.word.includes(' ');
}

export function resolveEffectiveMeaning(panel: WordPanelState): {
  translation: string;
  translationLang: string | null;
  translationSource: VocabTranslationSource | null;
  phraseDetails: AiPhraseDetails | null;
} {
  const isPhrase = isPhrasePanel(panel);
  const translation =
    panel.aiContextTranslation ?? panel.savedAiTranslation ?? panel.translation ?? '';
  const translationSource: VocabTranslationSource | null = panel.aiContextTranslation
    ? 'ai_context'
    : (panel.savedTranslationSource ??
      panel.translationSource ??
      (isPhrase ? 'ai_phrase' : panel.dictEntry ? 'dictionary' : null));
  return {
    translation,
    translationLang: panel.translationLang ?? null,
    translationSource,
    phraseDetails: isPhrase ? normalizePhraseDetails(panel.phraseDetails) : null,
  };
}

export type VocabUpdatePatch = Partial<
  Pick<
    VocabEntry,
    'state' | 'translation' | 'translationLang' | 'translationSource' | 'phraseDetails' | 'sentence'
  >
>;

export function buildVocabUpdatePatch(
  existing: VocabEntry,
  panel: WordPanelState,
  nextState?: WordState,
): VocabUpdatePatch {
  const isPhrase = isPhrasePanel(panel);
  const effective = resolveEffectiveMeaning(panel);
  const patch: VocabUpdatePatch = {};
  if (nextState !== undefined) patch.state = nextState;
  const preserveManualMeaning =
    existing.translationSource === 'manual' &&
    existing.state !== 'new' &&
    !panel.aiContextTranslation &&
    effective.translationSource !== 'manual';
  if (effective.translation && !preserveManualMeaning) {
    patch.translation = effective.translation;
    if (effective.translationLang !== null) patch.translationLang = effective.translationLang;
    if (effective.translationSource !== null) patch.translationSource = effective.translationSource;
    if (
      panel.aiContextTranslation ||
      existing.state === 'new' ||
      existing.translation !== effective.translation ||
      !existing.sentence
    ) {
      patch.sentence = panel.sentence;
    }
  }
  if (isPhrase && effective.phraseDetails) {
    patch.phraseDetails = effective.phraseDetails;
  }
  return patch;
}

export function applyRetranslateStart(prev: WordPanelState): WordPanelState {
  return {
    ...prev,
    aiContextTranslation: null,
    savedAiTranslation: null,
    savedTranslationSource: null,
    savedSentence: null,
    isLoading: true,
    error: null,
  };
}
