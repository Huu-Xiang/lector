import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LANGUAGES } from '@/lib/languages';
import type { VocabEntry } from '@/types';
import {
  applyRetranslateStart,
  buildVocabUpdatePatch,
  hydrateExistingVocab,
  isSavedAiTranslationSource,
  normalizePhraseDetails,
  shouldPersistImmediateAiUpdate,
  type WordPanelState,
} from '@/app/(app)/read/types';

const mockState = vi.hoisted(() => ({
  screenSize: '2xl' as 'xs' | '2xl',
  isNativeApp: false,
  lang: 'es' as 'es' | 'en',
}));

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>();
  return {
    ...actual,
    createPortal: (node: ReactNode) => node,
  };
});

vi.mock('@/utils/hooks', () => ({
  useActiveLanguage: () => LANGUAGES[mockState.lang],
  useScreenSize: () => mockState.screenSize,
}));

vi.mock('@/lib/native-app', () => ({
  useIsNativeApp: () => mockState.isNativeApp,
}));

import TranslationDrawer from './index';
import type { ExpandedDictionaryEntry, TranslationDrawerProps } from './types';

const enMessages = JSON.parse(
  readFileSync(join(process.cwd(), 'messages', 'en.json'), 'utf8'),
);

const dictEntry: ExpandedDictionaryEntry = {
  word: 'banco',
  senses: [
    { partOfSpeech: 'noun', gloss: 'bank (financial institution)' },
    { partOfSpeech: 'noun', gloss: 'bench' },
  ],
  needsLocalization: true,
};

function renderDrawer(props: Partial<TranslationDrawerProps> = {}) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
      <TranslationDrawer
        isOpen
        word="banco"
        sentence="Me senté en el banco del parque."
        entry={dictEntry}
        onClose={() => {}}
        onSpeak={() => {}}
        onRequestContextTranslation={() => {}}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

function basePanel(overrides: Partial<WordPanelState> = {}): WordPanelState {
  return {
    isOpen: true,
    word: 'banco',
    sentence: 'Me senté en el banco del parque.',
    translation: 'bank; bench',
    translationLang: 'en',
    translationSource: 'dictionary',
    savedAiTranslation: null,
    savedTranslationSource: null,
    savedSentence: null,
    partOfSpeech: 'noun',
    dictEntry,
    aiContextTranslation: null,
    aiStructured: null,
    phraseDetails: null,
    isLoading: false,
    isContextLoading: false,
    isStreamingGloss: false,
    isEnriching: false,
    isDictionaryResult: true,
    error: null,
    existingEntry: null,
    ...overrides,
  };
}

function makeVocab(overrides: Partial<VocabEntry> = {}): VocabEntry {
  return {
    id: 'v-1',
    text: 'banco',
    type: 'word',
    sentence: 'Me senté en el banco del parque.',
    translation: 'park bench (m.)',
    translationLang: 'en',
    translationSource: 'ai_context',
    state: 'level1',
    stateUpdatedAt: new Date('2026-01-01T00:00:00Z'),
    reviewCount: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    pushedToAnki: false,
    ...overrides,
  };
}

describe('TranslationDrawer saved AI meaning & phrase details (AE2)', () => {
  const originalDocument = globalThis.document;

  beforeEach(() => {
    mockState.screenSize = '2xl';
    mockState.isNativeApp = false;
    mockState.lang = 'es';
    (globalThis as { document?: unknown }).document = { body: {} };
  });

  afterEach(() => {
    (globalThis as { document?: unknown }).document = originalDocument;
  });

  it('renders savedAiTranslation as primary above collapsed Show dictionary (N) and hides In context on the same sentence', () => {
    const html = renderDrawer({
      savedAiTranslation: 'park bench (m.)',
      savedTranslationSource: 'ai_context',
      savedSentence: 'Me senté en el banco del parque.',
      aiTranslation: 'park bench (m.)',
      existingEntry: makeVocab(),
      wordState: 'level1',
    });

    expect(html).toContain('data-testid="saved-ai-result"');
    expect(html).toContain('park bench (m.)');
    expect(html).toContain('AI · in context');
    expect(html).toContain('Show dictionary (2)');
    expect(html).toContain('data-testid="saved-ai-dictionary-toggle"');
    // Same sentence as saved ai_context -> no redundant In context button.
    expect(html).not.toContain('data-testid="request-word-context"');
  });

  it('keeps In context enabled when clicked in a different sentence or when saved via ai_retranslate/manual', () => {
    const differentSentenceHtml = renderDrawer({
      sentence: 'Fui al banco a sacar dinero.',
      savedAiTranslation: 'park bench (m.)',
      savedTranslationSource: 'ai_context',
      savedSentence: 'Me senté en el banco del parque.',
      existingEntry: makeVocab(),
      wordState: 'level1',
    });
    expect(differentSentenceHtml).toContain('data-testid="request-word-context"');

    const retranslateHtml = renderDrawer({
      savedAiTranslation: 'bench; bank (m.)',
      savedTranslationSource: 'ai_retranslate',
      savedSentence: 'Me senté en el banco del parque.',
      existingEntry: makeVocab({ translationSource: 'ai_retranslate' }),
      wordState: 'level1',
    });
    expect(retranslateHtml).toContain('AI · saved');
    expect(retranslateHtml).toContain('data-testid="request-word-context"');

    const manualHtml = renderDrawer({
      savedAiTranslation: 'my custom bench meaning',
      savedTranslationSource: 'manual',
      savedSentence: 'Me senté en el banco del parque.',
      existingEntry: makeVocab({ translationSource: 'manual' }),
      wordState: 'level1',
    });
    expect(manualHtml).toContain('saved');
    expect(manualHtml).toContain('data-testid="request-word-context"');
  });

  it('surfaces the saved AI source pill in compact native iOS sheet body too', () => {
    mockState.isNativeApp = true;
    mockState.screenSize = 'xs';

    const html = renderDrawer({
      savedAiTranslation: 'park bench (m.)',
      savedTranslationSource: 'ai_retranslate',
      savedSentence: 'Me senté en el banco del parque.',
      existingEntry: makeVocab({ translationSource: 'ai_retranslate' }),
      wordState: 'level1',
    });

    expect(html).toContain('data-testid="saved-ai-result"');
    expect(html).toContain('data-testid="saved-ai-source-pill"');
    expect(html).toContain('AI · saved');
    expect(html).toContain('Show dictionary (2)');
  });

  it('renders hydrated phraseDetails immediately for a saved phrase', () => {
    const html = renderDrawer({
      word: 'tomar el pelo',
      sentence: 'Me estás tomando el pelo.',
      entry: null,
      aiTranslation: 'to pull someone’s leg',
      aiPhraseDetails: {
        literalBreakdown: 'tomar — take; el pelo — the hair (m.)',
        idiomaticMeaning: 'To tease or joke with someone playfully',
        usageNotes: 'Common in everyday Spanish',
        register: 'colloquial',
      },
      existingEntry: makeVocab({
        text: 'tomar el pelo',
        type: 'phrase',
        translation: 'to pull someone’s leg',
        translationSource: 'ai_phrase',
      }),
      wordState: 'level1',
    });

    expect(html).toContain('to pull someone’s leg');
    expect(html).toContain('tomar — take; el pelo — the hair (m.)');
    expect(html).toContain('To tease or joke with someone playfully');
    expect(html).toContain('Common in everyday Spanish');
    expect(html).toContain('colloquial');
  });
});

describe('Reader saved AI & phrase persistence state helpers (R2–R4)', () => {
  it('recognizes ai_context, ai_retranslate, and manual as saved AI/manual sources (not dictionary)', () => {
    expect(isSavedAiTranslationSource('ai_context')).toBe(true);
    expect(isSavedAiTranslationSource('ai_retranslate')).toBe(true);
    expect(isSavedAiTranslationSource('manual')).toBe(true);
    expect(isSavedAiTranslationSource('dictionary')).toBe(false);
    expect(isSavedAiTranslationSource('ai_phrase')).toBe(false);
    expect(isSavedAiTranslationSource(null)).toBe(false);
  });

  it('hydrates savedAiTranslation + savedSentence on saved AI words and phraseDetails on saved phrases', () => {
    const savedWord = makeVocab({
      translation: 'park bench (m.)',
      translationSource: 'ai_context',
      sentence: 'Me senté en el banco del parque.',
    });
    const hydratedWord = hydrateExistingVocab(basePanel({ isLoading: true }), savedWord, false, true);
    expect(hydratedWord.savedAiTranslation).toBe('park bench (m.)');
    expect(hydratedWord.savedTranslationSource).toBe('ai_context');
    expect(hydratedWord.savedSentence).toBe('Me senté en el banco del parque.');
    expect(hydratedWord.isLoading).toBe(false);

    const savedPhrase = makeVocab({
      text: 'tomar el pelo',
      type: 'phrase',
      translation: 'to pull someone’s leg',
      translationSource: 'ai_phrase',
      phraseDetails: {
        literalBreakdown: 'tomar — take; pelo — hair',
        idiomaticMeaning: 'To tease',
        usageNotes: 'Informal',
        register: 'colloquial',
      },
    });
    const hydratedPhrase = hydrateExistingVocab(
      basePanel({ word: 'tomar el pelo', isLoading: true, dictEntry: null }),
      savedPhrase,
      true,
      true,
    );
    expect(hydratedPhrase.translation).toBe('to pull someone’s leg');
    expect(hydratedPhrase.phraseDetails).toEqual(savedPhrase.phraseDetails);
    expect(hydratedPhrase.savedAiTranslation).toBeNull();
    expect(hydratedPhrase.isLoading).toBe(false);
  });

  it('auto-persists AI updates immediately only for already-saved rows (state !== new)', () => {
    expect(shouldPersistImmediateAiUpdate(undefined)).toBe(false);
    expect(shouldPersistImmediateAiUpdate(makeVocab({ state: 'new' }))).toBe(false);
    expect(shouldPersistImmediateAiUpdate(makeVocab({ state: 'level1' }))).toBe(true);
    expect(shouldPersistImmediateAiUpdate(makeVocab({ state: 'known' }))).toBe(true);
  });

  it('builds full update patches for existing state=new rows on re-save and preserves savedSentence on level-only bumps', () => {
    // Re-saving a state === 'new' row after clicking In context persists the AI meaning, source, lang, and sentence.
    const clearedRow = makeVocab({
      state: 'new',
      translation: 'bank',
      translationSource: 'dictionary',
      sentence: 'Old sentence.',
    });
    const contextPanel = basePanel({
      sentence: 'Me senté en el banco del parque.',
      aiContextTranslation: 'park bench (m.)',
      translationLang: 'en',
      translationSource: 'ai_context',
    });
    expect(buildVocabUpdatePatch(clearedRow, contextPanel, 'level1')).toEqual({
      state: 'level1',
      translation: 'park bench (m.)',
      translationLang: 'en',
      translationSource: 'ai_context',
      sentence: 'Me senté en el banco del parque.',
    });

    // Bumping level on an existing saved ai_context word in a different sentence WITHOUT clicking In context
    // preserves the original saved sentence.
    const savedRow = makeVocab({
      state: 'level1',
      translation: 'park bench (m.)',
      translationSource: 'ai_context',
      sentence: 'Me senté en el banco del parque.',
    });
    const newSentencePanel = basePanel({
      sentence: 'Fui al banco a sacar dinero.',
      translation: 'park bench (m.)',
      savedAiTranslation: 'park bench (m.)',
      savedTranslationSource: 'ai_context',
      savedSentence: 'Me senté en el banco del parque.',
      aiContextTranslation: null,
      translationSource: 'ai_context',
    });
    expect(buildVocabUpdatePatch(savedRow, newSentencePanel, 'level2')).toEqual({
      state: 'level2',
      translation: 'park bench (m.)',
      translationLang: 'en',
      translationSource: 'ai_context',
    });
  });

  it('clears stale aiContextTranslation and savedAiTranslation when starting Re-translate with AI', () => {
    const started = applyRetranslateStart(
      basePanel({
        aiContextTranslation: 'stale context meaning',
        savedAiTranslation: 'stale saved meaning',
        savedTranslationSource: 'ai_context',
        savedSentence: 'Old sentence.',
        error: 'previous error',
      }),
    );
    expect(started.aiContextTranslation).toBeNull();
    expect(started.savedAiTranslation).toBeNull();
    expect(started.savedTranslationSource).toBeNull();
    expect(started.savedSentence).toBeNull();
    expect(started.isLoading).toBe(true);
    expect(started.error).toBeNull();
  });

  it('normalizes phraseDetails and drops invalid LLM register strings cleanly', () => {
    expect(
      normalizePhraseDetails({
        literalBreakdown: '  tomar — take  ',
        idiomaticMeaning: '',
        usageNotes: 'Common',
        register: 'COLLOQUIAL',
      }),
    ).toEqual({
      literalBreakdown: 'tomar — take',
      usageNotes: 'Common',
      register: 'colloquial',
    });
    expect(
      normalizePhraseDetails({
        idiomaticMeaning: 'Joke',
        register: 'very casual / playful',
      }),
    ).toEqual({ idiomaticMeaning: 'Joke' });
    expect(normalizePhraseDetails({ idiomaticMeaning: '   ' })).toBeNull();
  });
});
