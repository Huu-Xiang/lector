'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { explainWordInContext, isAbortError, translateGloss } from '@/lib/claude';
import { getActiveLanguage, getSetting } from '@/lib/data-layer';
import {
  localizeEntrySenses,
  lookupWordRemote,
  type ExpandedDictionaryEntry,
} from '@/lib/dictionary-client';
import { loadNative } from '@/lib/library-titles';
import { shouldUseMonolingualAiGloss } from '@/lib/reader-meaning';
import { splitTrailingPunctuation } from '@/lib/words';

export interface PracticeWordTooltip {
  word: string;
  /** Full un-blanked sentence passed to AI for accurate contextual explanation. */
  contextSentence: string;
  /** Sentence displayed inside the drawer (blanked when answering a cloze/fill-in card). */
  displaySentence: string;
  translation: string | null;
  partOfSpeech: string | null;
  dictEntry: ExpandedDictionaryEntry | null;
  aiContextTranslation: string | null;
  isLoading: boolean;
  isContextLoading: boolean;
  error: string | null;
  contextError: string | null;
}

/**
 * Shared race-safe word lookup hook for Practice (both ClozePractice and WordReviewRound).
 * Cancels stale in-flight lookups via AbortController + monotonic request sequence,
 * respects monolingualExplanations, preserves dictionary details on in-context AI calls,
 * and uses explainWordInContext instead of the legacy translateWord endpoint.
 */
export function usePracticeWordLookup() {
  const t = useTranslations('practice');
  const [wordTooltip, setWordTooltip] = useState<PracticeWordTooltip | null>(null);
  const requestSeqRef = useRef(0);
  const contextSeqRef = useRef(0);
  const lookupAbortRef = useRef<AbortController | null>(null);
  const contextAbortRef = useRef<AbortController | null>(null);
  const monolingualRef = useRef<boolean | null>(null);

  const loadMonolingual = useCallback(async (): Promise<boolean> => {
    if (monolingualRef.current !== null) return monolingualRef.current;
    try {
      const val = Boolean(await getSetting<boolean | null>('monolingualExplanations'));
      monolingualRef.current = val;
      return val;
    } catch {
      return false;
    }
  }, []);

  const closeWordTooltip = useCallback(() => {
    requestSeqRef.current += 1;
    contextSeqRef.current += 1;
    lookupAbortRef.current?.abort();
    lookupAbortRef.current = null;
    contextAbortRef.current?.abort();
    contextAbortRef.current = null;
    setWordTooltip(null);
  }, []);

  useEffect(
    () => () => {
      lookupAbortRef.current?.abort();
      contextAbortRef.current?.abort();
    },
    [],
  );

  const lookupWord = useCallback(
    async (word: string, contextSentence: string, displaySentence?: string) => {
      const [cleanWord] = splitTrailingPunctuation(word.trim());
      const trimmed = cleanWord.replace(/^[^\p{L}\p{N}]+/u, '');
      if (!trimmed) return;

      const reqId = ++requestSeqRef.current;
      contextSeqRef.current += 1;
      lookupAbortRef.current?.abort();
      contextAbortRef.current?.abort();
      const controller = new AbortController();
      lookupAbortRef.current = controller;
      const { signal } = controller;

      const shownSentence = displaySentence ?? contextSentence;
      setWordTooltip({
        word: trimmed,
        contextSentence,
        displaySentence: shownSentence,
        translation: null,
        partOfSpeech: null,
        dictEntry: null,
        aiContextTranslation: null,
        isLoading: true,
        isContextLoading: false,
        error: null,
        contextError: null,
      });

      const activeLang = getActiveLanguage();
      const [loadedNative, monolingual] = await Promise.all([
        loadNative().catch(() => 'en'),
        loadMonolingual(),
      ]);
      if (signal.aborted || requestSeqRef.current !== reqId) return;

      const native = loadedNative ?? 'en';
      const useMonoAi = shouldUseMonolingualAiGloss(activeLang, monolingual);

      if (!useMonoAi) {
        let dictEntry: ExpandedDictionaryEntry | null = null;
        try {
          dictEntry = await lookupWordRemote(trimmed, native, {
            signal,
            language: activeLang,
          });
          if (!monolingual && dictEntry?.needsLocalization) {
            const senses = await localizeEntrySenses(trimmed, native, undefined, {
              signal,
              language: activeLang,
            });
            if (senses) dictEntry = { ...dictEntry, senses, needsLocalization: false };
          }
        } catch (err) {
          if (isAbortError(err)) return;
          dictEntry = null;
        }
        if (signal.aborted || requestSeqRef.current !== reqId) return;

        if (dictEntry && dictEntry.senses.length > 0) {
          setWordTooltip((prev) =>
            prev && requestSeqRef.current === reqId
              ? {
                  ...prev,
                  translation: dictEntry.senses.map((s) => s.gloss).join('; '),
                  partOfSpeech: dictEntry.senses[0]?.partOfSpeech || null,
                  dictEntry,
                  isLoading: false,
                  error: null,
                }
              : prev,
          );
          return;
        }
      }

      try {
        const result = await translateGloss(trimmed, contextSentence, {
          signal,
          language: activeLang,
        });
        if (signal.aborted || requestSeqRef.current !== reqId) return;
        setWordTooltip((prev) =>
          prev && requestSeqRef.current === reqId
            ? {
                ...prev,
                translation: result.translation,
                partOfSpeech: result.partOfSpeech || null,
                dictEntry: null,
                isLoading: false,
                error: null,
              }
            : prev,
        );
      } catch (err) {
        if (isAbortError(err) || requestSeqRef.current !== reqId) return;
        setWordTooltip((prev) =>
          prev && requestSeqRef.current === reqId
            ? {
                ...prev,
                isLoading: false,
                error: t('wordTooltip.tryAgain'),
              }
            : prev,
        );
      }
    },
    [loadMonolingual, t],
  );

  const requestContextTranslation = useCallback(async () => {
    if (!wordTooltip) return;
    const targetWord = wordTooltip.word;
    const contextSentence = wordTooltip.contextSentence;
    const reqId = requestSeqRef.current;
    const ctxId = ++contextSeqRef.current;
    contextAbortRef.current?.abort();
    const controller = new AbortController();
    contextAbortRef.current = controller;

    setWordTooltip((prev) =>
      prev ? { ...prev, isContextLoading: true, contextError: null } : prev,
    );

    try {
      const result = await explainWordInContext(targetWord, contextSentence, {
        signal: controller.signal,
        language: getActiveLanguage(),
      });
      if (
        controller.signal.aborted ||
        requestSeqRef.current !== reqId ||
        contextSeqRef.current !== ctxId
      ) {
        return;
      }
      setWordTooltip((prev) =>
        prev && requestSeqRef.current === reqId
          ? {
              ...prev,
              translation: prev.dictEntry ? prev.translation : result.translation,
              partOfSpeech: result.partOfSpeech || prev.partOfSpeech,
              aiContextTranslation: result.translation,
              isContextLoading: false,
              contextError: null,
            }
          : prev,
      );
    } catch (err) {
      if (isAbortError(err) || requestSeqRef.current !== reqId || contextSeqRef.current !== ctxId) {
        return;
      }
      setWordTooltip((prev) =>
        prev && requestSeqRef.current === reqId
          ? {
              ...prev,
              isContextLoading: false,
              contextError: t('wordTooltip.tryAgain'),
            }
          : prev,
      );
    }
  }, [wordTooltip, t]);

  return {
    wordTooltip,
    lookupWord,
    requestContextTranslation,
    closeWordTooltip,
  };
}
