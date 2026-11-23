import { AiPhraseDetails, VocabEntry, VocabTranslationSource, WordState } from '@/types';

/**
 * Shape returned by /api/dictionary/lookup. Mirror of the server-side type — kept in
 * sync with src/lib/server/dictionary-db.ts. Optional fields may be absent for sparse
 * Wiktionary entries.
 */
export interface ExpandedDictionaryEntry {
  word: string;
  rank?: number;
  ipa?: string;
  etymology?: string;
  senses: Array<{ partOfSpeech: string; gloss: string }>;
  relatedForms?: Array<{ form: string; relation: string }>;
  lemmaInfo?: { stem: string; label: string };
  /** `dict` = built-in kaikki dict, `cache` = user-learned AI translation. */
  source?: 'dict' | 'cache';
  /** Set when `senses` are already in the learner's own language. */
  /** The meanings are English and `/api/translate/localize` can turn them into the reader's language. */
  needsLocalization?: boolean;
  senseLanguage?: string;
  /** The English definitions, kept beside translated `senses`. */
  englishSenses?: Array<{ partOfSpeech: string; gloss: string }>;
  examples?: Array<{ text: string; translation?: string }>;
  tags?: string[];
  collins?: number;
  oxford?: boolean;
}

export interface TranslationDrawerProps {
  isOpen: boolean;
  word: string;
  sentence: string;

  /** Rich definition from local dictionary. Null while loading or when not found. */
  entry?: ExpandedDictionaryEntry | null;

  /** AI fallback translation (used when entry is null/absent). */
  aiTranslation?: string | null;
  aiPartOfSpeech?: string | null;
  /** Active AI in-context override from the current click session. */
  aiContextTranslation?: string | null;
  /** Persisted AI/manual meaning from `vocab` matching the active explanation language.
      Displayed as the primary translation above collapsed dictionary senses. */
  savedAiTranslation?: string | null;
  /** Provenance of `savedAiTranslation` (`ai_context`, `ai_retranslate`, or `manual`). */
  savedTranslationSource?: VocabTranslationSource | null;
  /** Sentence saved alongside `savedAiTranslation`; used to keep "In context" available on new sentences. */
  savedSentence?: string | null;
  /** Rich AI phrase details — populated when the word is a multi-word phrase. */
  aiPhraseDetails?: AiPhraseDetails | null;

  /** Whether the displayed result came from the on-device dictionary. */
  isDictionaryResult?: boolean;

  isLoading?: boolean;
  isContextLoading?: boolean;
  /** True while the fast gloss is still streaming — renders a live caret. */
  isStreaming?: boolean;
  /** True while the rich "enrich" lookup is in flight. */
  isEnriching?: boolean;
  error?: string | null;

  /** Existing vocab record (if word was previously saved). */
  existingEntry?: VocabEntry | null;
  /** Reader-local state, including an optimistic state awaiting persistence. */
  wordState?: WordState;

  /** Guided-onboarding progress, shown beside the level buttons so the action
      and its effect on the first review stay visually connected. */
  onboardingSaveProgress?: {
    savedCount: number;
    target: number;
    currentWordSaved: boolean;
    /** The reader saves the word by itself, so no level has to be chosen. */
    autoSave: boolean;
  };

  contextError?: string | null;
  repeatLookup?: boolean;
  onSaveWord?: () => void;
  onUndoSave?: () => void;
  onClose: () => void;
  onSpeak: (text: string) => void;
  /** Optional — provide to enable level 1-4 buttons in the footer. */
  onSetLevel?: (level: 1 | 2 | 3 | 4) => void;
  /** Optional — provide to enable the Known action. */
  onMarkKnown?: () => void;
  /** Optional — provide to enable the Ignore action. */
  onIgnore?: () => void;
  /** Request a fresh contextual translation from the AI (uses surrounding sentence). */
  onRequestContextTranslation?: () => void;
  /** Called when the user expands a collapsed dictionary section (triggers lazy localization). */
  onExpandDictionary?: () => void;
  /** Upgrade a fast streamed gloss to the full dictionary entry (senses, IPA,
      etymology, related forms). When absent the Enrich button is hidden. */
  onEnrich?: () => void;
  /** Force a fresh LLM lookup, ignoring cache + local dict. */
  onRetranslate?: () => void;
  /** Search the learner's active-language library for sentences containing this word/phrase. */
  onSearchLibrary?: () => void;
  /** Look up a word referenced inside the entry (form-of glosses, lemma stem,
      related forms — issue #106). When absent, references render as plain text. */
  onLookupWord?: (word: string) => void;
  /** Push a pure word card to the default Anki deck (single-word selections only). */
  onAddToAnki?: () => Promise<void>;
  /** Push a cloze card — called with the word the user chose to blank (phrase selections only). */
  onAddCloze?: (blankWord: string) => Promise<void>;
}
