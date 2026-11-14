'use client';

import { Fragment, useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import clsx from 'clsx';
import { useIsNativeApp } from '@/lib/native-app';
import { useNativeSheetDrag } from './use-native-sheet-drag';
import type { WordState } from '@/types';
import { sentenceContainsWord } from '@/lib/words';
import { foldWord, tokenizeWords, vocabKeys } from '@/lib/languages';
import { Button } from '@/components/ui/button';
import { useActiveLanguage, useScreenSize } from '@/utils/hooks';
import { TranslationDrawerProps } from './types';
import { wordStateColors } from './constants';
import { LevelCaption } from './LevelCaption';
import { ChevronRight, Ellipsis, RefreshCw, Sparkles, Volume2, X, Zap } from 'lucide-react';
import TargetText from '@/components/TargetText';
import NestedWordButton from './components/NestedWordButton';
import Gloss from './components/Gloss';
import { EntryBadges, EntryExtras, SenseGroups } from './components/EntryDetails';
import { LemmaLine, usePosLabel } from './components/DrawerLabels';
import { lookupAnnouncement } from './lookup-announcement';
import {
  SHEET_VH_CLOSE_BELOW,
  SHEET_VH_DEFAULT,
  applySheetVh,
  clampSheetVh,
  readStoredSheetVh,
  sheetVhFromPointer,
  storeSheetVh,
} from './sheet-height';

export { type ExpandedDictionaryEntry } from './types';
export { TranslationDrawerSlot } from './slot';

export default function TranslationDrawer({
  isOpen: rawIsOpen,
  word,
  sentence,
  entry,
  aiTranslation,
  aiPartOfSpeech,
  aiContextTranslation,
  aiPhraseDetails,
  isDictionaryResult,
  isLoading,
  isContextLoading,
  isStreaming,
  isEnriching,
  error,
  existingEntry,
  wordState,
  onboardingSaveProgress,
  contextError,
  repeatLookup,
  onSaveWord,
  onUndoSave,
  onClose,
  onSpeak,
  onSetLevel,
  onMarkKnown,
  onIgnore,
  onRequestContextTranslation,
  onEnrich,
  onRetranslate,
  onLookupWord,
  onAddToAnki,
  onAddCloze,
}: TranslationDrawerProps) {
  const t = useTranslations('reader.drawer');
  const posLabel = usePosLabel();
  const pack = useActiveLanguage();
  const drawerRef = useRef<HTMLDivElement>(null);
  const dragStartVh = useRef<number | null>(null);
  const dragVh = useRef(0);
  const [relatedExpanded, setRelatedExpanded] = useState(false);
  useEffect(() => {
    const stored = readStoredSheetVh();
    if (stored !== null) applySheetVh(stored);
  }, []);
  const screenSize = useScreenSize();
  const compact = useIsNativeApp();
  const nativeSheet = compact && ['xs', 'sm', 'md'].includes(screenSize);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [previousOpen, setPreviousOpen] = useState(rawIsOpen);
  const moreButton = useRef<HTMLButtonElement>(null);
  const optionsHeading = useRef<HTMLHeadingElement>(null);
  const nativeDrag = useNativeSheetDrag(nativeSheet && rawIsOpen);
  if (rawIsOpen !== previousOpen) {
    setPreviousOpen(rawIsOpen);
    setActionsOpen(false);
  }
  useEffect(() => {
    if (actionsOpen) optionsHeading.current?.focus();
  }, [actionsOpen]);
  // Anki push status for single-word cards
  const [ankiStatus, setAnkiStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  // Cloze picker state for phrase selections
  const [clozePickerOpen, setClozePickerOpen] = useState(false);
  const [clozeBlankWord, setClozeBlankWord] = useState<string | null>(null);
  const [clozeStatus, setClozeStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  // Reset the "show all related forms" toggle whenever the looked-up word
  // changes — uses React's adjusting-state-during-render pattern so we avoid
  // a setState-in-effect cascade.
  const [prevWord, setPrevWord] = useState(word);
  if (word !== prevWord) {
    setPrevWord(word);
    setActionsOpen(false);
    setRelatedExpanded(false);
    setAnkiStatus('idle');
    setClozePickerOpen(false);
    setClozeBlankWord(null);
    setClozeStatus('idle');
  }

  const docked = screenSize === '2xl';
  const isOpen = useMemo(() => docked || rawIsOpen, [docked, rawIsOpen]);
  const idle = docked && !word.trim();

  useEffect(() => {
    if (!isOpen || docked) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose, docked]);

  // Click-outside-to-close intentionally omitted: it races with the
  // new-word click handler (mousedown closes the drawer before the click
  // fires on the new word). Users dismiss with Esc or the close button,
  // and clicking another word simply switches the drawer to that word.

  const handleSpeakWord = useCallback(() => onSpeak(word), [onSpeak, word]);
  const handleSpeakSentence = useCallback(() => onSpeak(sentence), [onSpeak, sentence]);

  // Languages with `pronunciation.audio: 'none'` (#307 §3.2a) have no sensible
  // synthesized voice — the speaker buttons absent themselves entirely.
  const speakable = pack.pronunciation.audio !== 'none';

  const currentState = wordState ?? existingEntry?.state ?? 'new';
  const stateColors = wordStateColors[currentState];
  const isPhrase = word.includes(' ');
  const longTitle = isPhrase || word.length > 30;
  // After a nested lookup (issue #106) the drawer keeps the sentence of the
  // word the user originally clicked — genuine provenance, but not context
  // for the current word unless it actually occurs in it ("sien" is not in
  // "Ek het die katte gesien"). Only offer the in-context AI translation
  // when it does.
  const wordOccursInSentence = !!sentence && sentenceContainsWord(sentence, word, pack);
  const showHighlightedSentence = compact || !!aiContextTranslation;
  const contextTokens = showHighlightedSentence ? tokenizeWords(sentence, pack) : [];
  const selectedKeys = showHighlightedSentence ? vocabKeys(foldWord(word, pack), pack) : [];
  const highlights = contextTokens.filter((token) =>
    vocabKeys(foldWord(token.text, pack), pack).some((key) => selectedKeys.includes(key)),
  );
  const requestContextButton = !isPhrase &&
    !isLoading &&
    !isContextLoading &&
    !isStreaming &&
    !aiContextTranslation &&
    onRequestContextTranslation &&
    wordOccursInSentence && (
      <button
        onClick={onRequestContextTranslation}
        data-testid="request-word-context"
        className={clsx(
          'inline-flex shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold text-[var(--clay)] hover:bg-[var(--clay-soft)]',
          compact ? 'min-h-11 max-w-[45%] whitespace-normal' : 'mt-3 bg-[var(--clay-soft)] py-1',
        )}
        title={t('inContextTitle')}
      >
        <Zap className="size-3 shrink-0" aria-hidden />
        {contextError ? t('contextRetry') : t('inContext')}
      </button>
    );
  const canSaveWord = onSaveWord && currentState === 'new' && !error && !isLoading;
  const isSavedWord = onSaveWord && currentState.startsWith('level');

  const senses = entry?.senses ?? [];
  const hasRichEntry = senses.length > 0;
  const fallbackTranslation = aiTranslation ?? null;
  const leadSenses = compact && sentence ? senses.slice(0, 1) : senses;
  const hasDictionaryDetails = !!(
    senses.length > leadSenses.length ||
    entry?.rank ||
    entry?.oxford ||
    entry?.collins ||
    entry?.tags?.length ||
    entry?.englishSenses?.length ||
    entry?.examples?.length ||
    entry?.etymology ||
    entry?.relatedForms?.length ||
    entry?.lemmaInfo
  );
  const DictionaryDetails = compact ? 'details' : Fragment;
  const announcement = lookupAnnouncement(
    {
      isOpen,
      word,
      isLoading: !!isLoading,
      error,
      hasResult: !!(hasRichEntry || fallbackTranslation || aiContextTranslation || aiPhraseDetails),
    },
    (key, values) => t(`announce.${key}`, values),
  );

  const hasSecondaryActions = !!(
    onSetLevel ||
    onMarkKnown ||
    onIgnore ||
    onRetranslate ||
    onAddToAnki ||
    onAddCloze
  );

  const secondaryActions = (
    <>
      {onSetLevel && <LevelCaption />}
      {(onSetLevel || onMarkKnown || onIgnore) && (
        <div className="flex flex-wrap items-center gap-2">
          {onSetLevel && (
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((level) => {
                const stateKey = `level${level}` as WordState;
                const isActive = currentState === stateKey;
                const colors = wordStateColors[stateKey];
                return (
                  <button
                    key={level}
                    onClick={() => onSetLevel(level as 1 | 2 | 3 | 4)}
                    data-testid={`word-level-${level}`}
                    aria-label={t('saveAtLevel', { level })}
                    className={`h-9 w-9 rounded-lg text-sm font-semibold transition-all ${
                      isActive
                        ? `${colors.bg} ${colors.text} ring-2 ring-offset-1 ring-offset-popover ${colors.ring}`
                        : 'bg-muted text-muted-foreground hover:bg-accent'
                    }`}
                    title={t('levelTitle', { level })}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
          )}
          {onMarkKnown && (
            <button
              onClick={onMarkKnown}
              data-testid="mark-word-known"
              className={`h-9 rounded-lg px-3 text-sm font-medium transition-colors ${
                currentState === 'known'
                  ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1 ring-offset-popover'
                  : 'bg-muted text-foreground hover:bg-[var(--primary-soft)] hover:text-[var(--primary-text)]'
              }`}
              title={t('markKnownTitle')}
            >
              {t('known')}
            </button>
          )}
          {onIgnore && (
            <button
              onClick={onIgnore}
              data-testid="ignore-word"
              className={`h-9 rounded-lg px-3 text-sm font-medium transition-colors ${
                currentState === 'ignored'
                  ? 'bg-muted-foreground text-card ring-2 ring-muted-foreground ring-offset-1 ring-offset-popover'
                  : 'bg-muted text-foreground hover:bg-accent'
              }`}
              title={t('ignoreTitle')}
            >
              {t('ignore')}
            </button>
          )}
        </div>
      )}
      <div className="flex gap-2 empty:hidden lg:flex-col">
        {onRetranslate && (
          <button
            onClick={onRetranslate}
            className="flex w-full min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={t('retranslateTitle')}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t('retranslate')}
          </button>
        )}
        {/* Anki — single word: pure word card */}
        {!isPhrase && onAddToAnki && (hasRichEntry || fallbackTranslation) && !isLoading && (
          <button
            data-testid="add-to-anki-btn"
            onClick={async () => {
              if (ankiStatus === 'loading' || ankiStatus === 'done') return;
              setAnkiStatus('loading');
              try {
                await onAddToAnki();
                setAnkiStatus('done');
              } catch {
                setAnkiStatus('error');
              }
            }}
            disabled={ankiStatus === 'loading' || ankiStatus === 'done'}
            className={`flex w-full min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              ankiStatus === 'done'
                ? 'cursor-default border-primary/40 bg-primary/10 text-[var(--primary-text)]'
                : ankiStatus === 'error'
                  ? 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20'
                  : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {ankiStatus === 'done'
              ? t('ankiAdded')
              : ankiStatus === 'loading'
                ? t('ankiAdding')
                : ankiStatus === 'error'
                  ? t('ankiError')
                  : t('ankiAdd')}
          </button>
        )}
      </div>
      {/* Anki — phrase: cloze card with inline word picker */}
      {isPhrase && onAddCloze && (fallbackTranslation || aiPhraseDetails) && !isLoading && (
        <div data-testid="add-cloze-section">
          {!clozePickerOpen ? (
            <button
              data-testid="add-cloze-btn"
              onClick={() => setClozePickerOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {t('clozeAdd')}
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{t('clozePick')}</p>
              <div className="flex flex-wrap gap-1" data-testid="cloze-word-chips">
                {word
                  .split(/\s+/)
                  .filter(Boolean)
                  .map((w, i) => (
                    <button
                      key={i}
                      data-testid={`cloze-chip-${i}`}
                      onClick={() => setClozeBlankWord(clozeBlankWord === w ? null : w)}
                      className={`rounded px-2 py-0.5 text-sm font-medium transition-colors ${
                        clozeBlankWord === w
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground hover:bg-accent'
                      }`}
                    >
                      {w}
                    </button>
                  ))}
              </div>
              {clozeBlankWord && (
                <p className="font-mono text-xs text-muted-foreground" data-testid="cloze-preview">
                  {word
                    .split(/\s+/)
                    .filter(Boolean)
                    .map((w, i) => (
                      <span key={i}>
                        {i > 0 && ' '}
                        {w === clozeBlankWord ? (
                          <span className="font-semibold text-primary">[{w}]</span>
                        ) : (
                          w
                        )}
                      </span>
                    ))}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  data-testid="cloze-send-btn"
                  onClick={async () => {
                    if (!clozeBlankWord || clozeStatus === 'loading' || clozeStatus === 'done')
                      return;
                    setClozeStatus('loading');
                    try {
                      await onAddCloze(clozeBlankWord);
                      setClozeStatus('done');
                    } catch {
                      setClozeStatus('error');
                    }
                  }}
                  disabled={!clozeBlankWord || clozeStatus === 'loading' || clozeStatus === 'done'}
                  className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    !clozeBlankWord || clozeStatus === 'loading'
                      ? 'cursor-not-allowed border-border text-muted-foreground opacity-50'
                      : clozeStatus === 'done'
                        ? 'cursor-default border-primary/40 bg-primary/10 text-[var(--primary-text)]'
                        : clozeStatus === 'error'
                          ? 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20'
                          : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  {clozeStatus === 'done'
                    ? t('clozeSent')
                    : clozeStatus === 'loading'
                      ? t('clozeSending')
                      : clozeStatus === 'error'
                        ? t('clozeError')
                        : t('clozeSend')}
                </button>
                {clozeStatus !== 'done' && (
                  <button
                    data-testid="cloze-cancel-btn"
                    onClick={() => {
                      setClozePickerOpen(false);
                      setClozeBlankWord(null);
                      setClozeStatus('idle');
                    }}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {t('cancel')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  const lookupBadges = (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium',
          stateColors.bg,
          stateColors.text,
          longTitle && 'max-lg:hidden',
        )}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${stateColors.dot}`} />
        {t(`state.${currentState}`)}
      </span>
      {/* Source attribution — always tells the user where the
                  currently-displayed translation came from. */}
      {aiContextTranslation ? (
        <span className="inline-flex items-center gap-1 rounded-md bg-[var(--clay-soft)] px-2 py-0.5 text-xs font-medium text-[var(--clay)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--clay)]" />
          {t('sourceAiInContext')}
        </span>
      ) : entry?.source === 'cache' ? (
        <span className="inline-flex items-center gap-1 rounded-md bg-[var(--gold-soft)] px-2 py-0.5 text-xs font-medium text-[var(--gold-strong)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--gold-strong)]" />
          {t('sourceLearned')}
        </span>
      ) : isDictionaryResult ? (
        <span className="inline-flex items-center gap-1 rounded-md bg-[var(--primary-soft)] px-2 py-0.5 text-xs font-medium text-[var(--primary-text)]">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          {t('sourceOnDevice')}
        </span>
      ) : (fallbackTranslation || aiPhraseDetails) && !isLoading ? (
        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
          {t('sourceAi')}
        </span>
      ) : null}
    </div>
  );

  const originalSentence = sentence && !aiContextTranslation && (
    <section
      className={clsx('border-b border-border px-4', compact ? 'py-2' : 'py-3')}
      data-testid="lookup-original-sentence"
    >
      <div className="flex items-start gap-2">
        <TargetText
          className="min-w-0 flex-1 text-sm leading-relaxed text-muted-foreground italic"
          as="p"
        >
          {compact
            ? highlights.map((token, index) => (
                <Fragment key={token.start}>
                  {sentence.slice(highlights[index - 1]?.end ?? 0, token.start)}
                  <mark className="rounded bg-primary/15 text-foreground">{token.text}</mark>
                </Fragment>
              ))
            : sentence}
          {compact && sentence.slice(highlights.at(-1)?.end ?? 0)}
        </TargetText>
        {speakable && (
          <button
            onClick={handleSpeakSentence}
            className="flex-shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={t('hearSentence')}
            aria-label={t('hearSentence')}
          >
            <Volume2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </section>
  );

  const content = (
    <div
      data-testid="translation-drawer"
      aria-hidden={docked ? false : !isOpen}
      className={clsx(
        'flex flex-col border-border bg-popover print:hidden',
        nativeSheet && 'native-lookup-sheet',
        docked
          ? 'relative h-full w-full translate-x-0 border-l shadow-none'
          : [
              'fixed z-50 shadow-2xl transition-transform duration-300 ease-out',
              'inset-x-0 bottom-0 h-[var(--sheet-h)] rounded-t-2xl border-t',
              'lg:inset-x-auto lg:inset-y-0 lg:right-0 lg:h-auto lg:max-h-screen lg:w-96 lg:rounded-none lg:border-t-0 lg:border-l',
              isOpen
                ? 'translate-y-0 lg:translate-x-0'
                : 'pointer-events-none translate-y-full lg:translate-x-full lg:translate-y-0',
            ],
      )}
      ref={drawerRef}
      data-native-sheet={nativeSheet || undefined}
      data-native-side-drawer={(compact && !nativeSheet && !docked) || undefined}
      role={docked ? 'complementary' : 'dialog'}
      aria-label={idle ? t('wordDefinition') : t('definitionOf', { word })}
    >
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="lookup-announcement"
      >
        {announcement}
      </div>
      {idle ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p data-testid="translation-drawer-empty" className="text-sm text-muted-foreground">
            {t('clickToLookUp')}
          </p>
        </div>
      ) : (
        <>
          {nativeSheet && (
            <button
              type="button"
              {...nativeDrag.handle}
              data-testid="translation-drawer-handle"
              aria-label={nativeDrag.expanded ? t('collapseSheet') : t('expandSheet')}
              aria-expanded={nativeDrag.expanded}
              className="flex h-6 shrink-0 cursor-row-resize touch-none items-center justify-center focus-visible:outline focus-visible:outline-ring"
            >
              <span className="h-1.5 w-10 rounded-full bg-border" />
            </button>
          )}
          {!nativeSheet && !docked && (
            <div
              data-testid="translation-drawer-handle"
              className="flex flex-shrink-0 cursor-row-resize touch-none justify-center pt-3 pb-2 lg:hidden"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                dragStartVh.current = readStoredSheetVh() ?? SHEET_VH_DEFAULT;
                dragVh.current = dragStartVh.current;
              }}
              onPointerMove={(e) => {
                if (dragStartVh.current === null) return;
                dragVh.current = sheetVhFromPointer(e.clientY, window.innerHeight);
                applySheetVh(clampSheetVh(dragVh.current));
              }}
              onPointerUp={() => {
                const before = dragStartVh.current;
                dragStartVh.current = null;
                if (before === null) return;
                if (dragVh.current < SHEET_VH_CLOSE_BELOW) {
                  applySheetVh(before);
                  onClose();
                  return;
                }
                storeSheetVh(clampSheetVh(dragVh.current));
              }}
              onPointerCancel={() => {
                if (dragStartVh.current !== null) applySheetVh(dragStartVh.current);
                dragStartVh.current = null;
              }}
            >
              <span className="h-1.5 w-12 rounded-full bg-border" />
            </div>
          )}
          {/* Header */}
          <div
            className={clsx(
              'shrink-0 border-b border-border',
              compact ? 'px-3' : 'bg-muted/50 px-4 py-3',
            )}
          >
            <div
              className={clsx(
                'flex justify-between',
                compact ? 'items-center' : 'items-start gap-2',
              )}
            >
              <div className="min-w-0 flex-1">
                <div
                  className={clsx(
                    'flex items-center',
                    compact ? 'min-w-0 gap-0.5' : 'flex-wrap gap-2',
                  )}
                >
                  {(!compact || currentState !== 'new') && (
                    <span
                      className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${stateColors.dot}`}
                      title={t(`state.${currentState}`)}
                      role="img"
                      aria-label={t(`state.${currentState}`)}
                    />
                  )}
                  <h2
                    className={clsx(
                      'font-semibold break-words text-foreground',
                      compact
                        ? 'min-w-0 truncate text-base'
                        : longTitle
                          ? 'line-clamp-1 min-w-0 flex-1 text-sm lg:line-clamp-none lg:text-xl'
                          : 'text-xl',
                    )}
                    title={compact || longTitle ? word : undefined}
                  >
                    <TargetText>{word}</TargetText>
                  </h2>
                  {speakable && (
                    <button
                      onClick={handleSpeakWord}
                      className={clsx(
                        'shrink-0 rounded p-1 text-muted-foreground hover:bg-accent',
                        compact && 'grid size-11 place-items-center',
                      )}
                      title={t('hearPronunciation')}
                      aria-label={t('hearPronunciation')}
                    >
                      <Volume2 className="h-5 w-5" />
                    </button>
                  )}
                  {entry?.ipa && (!compact || !requestContextButton) && (
                    <TargetText
                      className={`text-sm text-muted-foreground ${
                        pack.script.direction === 'rtl' || pack.pronunciation?.annotation
                          ? ''
                          : 'font-mono'
                      }`}
                      as="span"
                    >
                      {entry.ipa}
                    </TargetText>
                  )}
                </div>
                {!compact && entry?.lemmaInfo && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    <LemmaLine
                      label={entry.lemmaInfo.label}
                      stem={
                        onLookupWord ? (
                          <NestedWordButton
                            word={entry.lemmaInfo.stem}
                            onLookupWord={onLookupWord}
                            testId="lemma-stem-link"
                          />
                        ) : (
                          <TargetText className="font-medium text-foreground" as="span">
                            {entry.lemmaInfo.stem}
                          </TargetText>
                        )
                      }
                    />
                  </p>
                )}
                {!compact && lookupBadges}
              </div>
              {compact && requestContextButton}
              <button
                onClick={onClose}
                className={clsx(
                  'flex-shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                  docked && 'hidden',
                  compact && 'grid size-11 place-items-center',
                )}
                aria-label={t('close')}
                title={t('closeEsc')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Body — scrollable */}
          {compact && actionsOpen && (
            <div className="native-lookup-options min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3">
              <h3 ref={optionsHeading} tabIndex={-1} className="text-sm font-semibold">
                {t('moreActions')}
              </h3>
              {lookupBadges}
              {secondaryActions}
            </div>
          )}
          <div
            hidden={compact && actionsOpen}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          >
            {/* Definition section */}
            <section className={clsx('border-b border-border px-4', compact ? 'py-2' : 'py-4')}>
              {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  {t('lookingUp')}
                </div>
              ) : error && !aiContextTranslation ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : aiContextTranslation ? (
                <div data-testid="word-context-result">
                  <h3 className="mb-1 text-sm font-semibold">{t('contextHeading')}</h3>
                  <p
                    className={clsx(
                      'text-foreground',
                      compact ? 'text-sm leading-normal' : 'leading-relaxed',
                    )}
                  >
                    {aiContextTranslation}
                  </p>
                  <div className="mt-3 flex items-start gap-2">
                    <TargetText
                      as="p"
                      className="flex-1 text-sm leading-relaxed text-muted-foreground"
                    >
                      {highlights.map((token, index) => (
                        <span key={token.start}>
                          {sentence.slice(highlights[index - 1]?.end ?? 0, token.start)}
                          <mark className="rounded bg-primary/15 text-foreground">
                            {token.text}
                          </mark>
                        </span>
                      ))}
                      {sentence.slice(highlights.at(-1)?.end ?? 0)}
                    </TargetText>
                    {speakable && (
                      <button
                        onClick={handleSpeakSentence}
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label={t('hearSentence')}
                      >
                        <Volume2 className="size-4" />
                      </button>
                    )}
                  </div>
                  {(hasRichEntry || fallbackTranslation) && (
                    <details className="group mt-3">
                      <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                        <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                        {hasRichEntry
                          ? t('showDictionary', { count: senses.length })
                          : t('originalDefinition')}
                      </summary>
                      {hasRichEntry ? (
                        <ol className="mt-2 space-y-2">
                          {senses.map((sense, i) => (
                            <li key={i} className="flex gap-3 text-sm">
                              <span className="mt-0.5 flex-shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
                                {i + 1}.
                              </span>
                              <div className="min-w-0 flex-1">
                                {sense.partOfSpeech && (
                                  <span className="mr-2 inline-block rounded bg-muted px-1.5 py-0.5 align-middle text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                                    {posLabel(sense.partOfSpeech)}
                                  </span>
                                )}
                                <span className="text-foreground">
                                  <Gloss text={sense.gloss} onLookupWord={onLookupWord} />
                                </span>
                              </div>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="mt-2 text-sm">{fallbackTranslation}</p>
                      )}
                    </details>
                  )}
                </div>
              ) : hasRichEntry ? (
                <div className="space-y-3">
                  {!compact && entry && <EntryBadges entry={entry} />}
                  <SenseGroups
                    senses={leadSenses}
                    onLookupWord={onLookupWord}
                    inlinePartOfSpeech={compact}
                  />
                </div>
              ) : fallbackTranslation ? (
                <div>
                  {aiPartOfSpeech && (
                    <span className="mr-2 inline-block rounded bg-muted px-1.5 py-0.5 align-middle text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                      {posLabel(aiPartOfSpeech)}
                    </span>
                  )}
                  <span className="leading-relaxed text-foreground">
                    {fallbackTranslation}
                    {isStreaming && (
                      <span
                        className="-mb-0.5 ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-primary"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">{t('noDefinition')}</p>
              )}

              {!compact && requestContextButton}
              {contextError && (
                <p role="status" className="mt-2 text-sm text-destructive">
                  {contextError}
                </p>
              )}
              {isContextLoading && (
                <span className="mt-3 inline-flex items-center gap-1.5 text-xs text-[var(--clay)]">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--clay)] border-t-transparent" />
                  {t('askingAi')}
                </span>
              )}

              {/* Enrich — upgrade a fast streamed gloss to the full dictionary entry
          (senses, IPA, etymology, related forms). Only offered for a bare AI
          gloss (the page passes onEnrich only when there's no rich entry yet). */}
              {onEnrich &&
                !aiContextTranslation &&
                !isPhrase &&
                !isLoading &&
                !isStreaming &&
                !isContextLoading &&
                !isEnriching && (
                  <button
                    onClick={onEnrich}
                    className="mt-3 ml-2 inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    title={t('enrichTitle')}
                  >
                    <Sparkles className="h-3 w-3" />
                    {t('enrich')}
                  </button>
                )}
              {isEnriching && (
                <span className="mt-3 ml-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                  {t('enriching')}
                </span>
              )}
            </section>

            {/* Rich phrase details (idiom, literal breakdown, usage notes, register) */}
            {aiPhraseDetails &&
              (aiPhraseDetails.literalBreakdown ||
                aiPhraseDetails.idiomaticMeaning ||
                aiPhraseDetails.usageNotes ||
                aiPhraseDetails.register) && (
                <section className="space-y-3 border-b border-border px-4 py-3">
                  {aiPhraseDetails.idiomaticMeaning && (
                    <div>
                      <h3 className="mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                        {t('idiomaticMeaning')}
                      </h3>
                      <p className="text-sm leading-relaxed text-foreground">
                        {aiPhraseDetails.idiomaticMeaning}
                      </p>
                    </div>
                  )}
                  {aiPhraseDetails.literalBreakdown && (
                    <div>
                      <h3 className="mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                        {t('literally')}
                      </h3>
                      <p className="text-sm leading-relaxed text-foreground italic">
                        {aiPhraseDetails.literalBreakdown}
                      </p>
                    </div>
                  )}
                  {aiPhraseDetails.usageNotes && (
                    <div>
                      <h3 className="mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                        {t('usage')}
                      </h3>
                      <p className="text-sm leading-relaxed text-foreground">
                        {aiPhraseDetails.usageNotes}
                      </p>
                    </div>
                  )}
                  {aiPhraseDetails.register && aiPhraseDetails.register !== 'neutral' && (
                    <div className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                      {aiPhraseDetails.register}
                    </div>
                  )}
                </section>
              )}

            {compact && !isLoading && originalSentence}
            {(!compact || hasDictionaryDetails) && (
              <DictionaryDetails>
                {compact && (
                  <>
                    <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium text-muted-foreground">
                      <ChevronRight className="size-4" aria-hidden="true" />
                      {t('dictionaryDetails')}
                    </summary>
                    <div className="space-y-2 px-4 pb-2">
                      {entry && <EntryBadges entry={entry} />}
                      {entry?.lemmaInfo && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          <LemmaLine
                            label={entry.lemmaInfo.label}
                            stem={
                              onLookupWord ? (
                                <NestedWordButton
                                  word={entry.lemmaInfo.stem}
                                  onLookupWord={onLookupWord}
                                  testId="lemma-stem-link"
                                />
                              ) : (
                                <TargetText className="font-medium text-foreground" as="span">
                                  {entry.lemmaInfo.stem}
                                </TargetText>
                              )
                            }
                          />
                        </p>
                      )}
                      {!aiContextTranslation && senses.length > leadSenses.length && (
                        <SenseGroups
                          senses={senses.slice(leadSenses.length)}
                          onLookupWord={onLookupWord}
                          inlinePartOfSpeech
                        />
                      )}
                    </div>
                  </>
                )}
                {entry && !aiContextTranslation && (
                  <EntryExtras
                    entry={entry}
                    word={word}
                    onLookupWord={onLookupWord}
                    inlinePartOfSpeech={compact}
                  />
                )}

                {/* Etymology */}
                {entry?.etymology && (
                  <section className="border-b border-border px-4 py-3">
                    <h3 className="mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                      {t('etymology')}
                    </h3>
                    <p className="text-sm leading-relaxed text-foreground">{entry.etymology}</p>
                  </section>
                )}

                {/* Related forms — capped at 3 with expand toggle to keep the drawer
        from being flooded by polysemous words (e.g. "Dit" has ~20 forms). */}
                {entry?.relatedForms &&
                  entry.relatedForms.length > 0 &&
                  (() => {
                    const total = entry.relatedForms.length;
                    const COLLAPSED_COUNT = 3;
                    const shown = relatedExpanded
                      ? entry.relatedForms
                      : entry.relatedForms.slice(0, COLLAPSED_COUNT);
                    const hiddenCount = total - shown.length;
                    return (
                      <section className="border-b border-border px-4 py-3">
                        <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                          {t('relatedForms')}
                        </h3>
                        <ul className="space-y-1">
                          {shown.map((r, i) => (
                            <li key={i} className="text-sm">
                              {onLookupWord ? (
                                <NestedWordButton
                                  word={r.form}
                                  onLookupWord={onLookupWord}
                                  testId="related-form-link"
                                />
                              ) : (
                                <TargetText className="font-medium text-foreground" as="span">
                                  {r.form}
                                </TargetText>
                              )}
                              <span className="ml-2 text-xs text-muted-foreground">
                                {r.relation}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {total > COLLAPSED_COUNT && (
                          <button
                            onClick={() => setRelatedExpanded((v) => !v)}
                            className="mt-2 text-xs font-medium text-primary transition-colors hover:text-[var(--primary-text)]"
                          >
                            {relatedExpanded ? t('showFewer') : t('showAll', { count: total })}
                            {!relatedExpanded && hiddenCount > 0 && (
                              <span className="ml-1 text-muted-foreground">+{hiddenCount}</span>
                            )}
                          </button>
                        )}
                      </section>
                    );
                  })()}
              </DictionaryDetails>
            )}
            {!compact && originalSentence}
          </div>

          {/* Footer — action buttons. */}
          {(onSaveWord ||
            onSetLevel ||
            onMarkKnown ||
            onIgnore ||
            onRetranslate ||
            onAddToAnki ||
            onAddCloze) && (
            <div
              className={clsx(
                'shrink-0 border-t border-border bg-muted/50',
                compact ? 'px-3 py-1.5' : 'space-y-2 px-4 py-3',
              )}
            >
              <div className={clsx(compact && 'flex items-center gap-2')}>
                {(canSaveWord || isSavedWord) && (
                  <div
                    className={clsx(
                      'flex flex-wrap items-center gap-x-3 gap-y-1',
                      compact && 'min-w-0 flex-1',
                    )}
                  >
                    {canSaveWord ? (
                      <>
                        <Button
                          className={clsx(
                            'min-h-11',
                            compact
                              ? 'h-auto w-full px-2 py-2 whitespace-normal'
                              : 'w-full sm:w-auto',
                          )}
                          onClick={() => onSaveWord()}
                          data-testid="save-looked-up-word"
                        >
                          <span aria-hidden="true">+</span> {t('saveWord')}
                        </Button>
                        {!compact && (
                          <kbd className="hidden rounded border border-border px-1.5 text-xs text-muted-foreground lg:inline">
                            S
                          </kbd>
                        )}
                        {repeatLookup && (
                          <p
                            className="text-xs text-muted-foreground"
                            data-testid="repeat-lookup-hint"
                          >
                            {t('repeatLookup')}
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <span role="status" className="text-sm font-medium">
                          {t('wordSaved')}
                        </span>
                        {onUndoSave && (
                          <Button
                            variant="ghost"
                            className="min-h-11"
                            onClick={onUndoSave}
                            data-testid="undo-lookup-save"
                          >
                            {t('undoSave')}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}
                {compact && hasSecondaryActions && (
                  <Button
                    ref={moreButton}
                    variant="outline"
                    size="icon-lg"
                    aria-label={actionsOpen ? t('backToDefinition') : t('moreActions')}
                    aria-expanded={actionsOpen}
                    data-testid="native-lookup-actions"
                    className="ml-auto"
                    onClick={() => {
                      setActionsOpen(!actionsOpen);
                      if (actionsOpen) moreButton.current?.focus();
                    }}
                  >
                    {actionsOpen ? <X aria-hidden="true" /> : <Ellipsis aria-hidden="true" />}
                  </Button>
                )}
              </div>
              {onboardingSaveProgress && (
                <div
                  className="rounded-xl border border-[var(--gold-lip)] bg-[var(--gold-soft)] px-3 py-2 lg:p-3"
                  data-testid="onboarding-drawer-progress"
                  role="status"
                >
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-foreground">
                      {onboardingSaveProgress.currentWordSaved
                        ? t('onboardingAdded')
                        : !onboardingSaveProgress.autoSave && t('onboardingChoose')}
                    </span>
                    <span className="shrink-0 font-bold text-[var(--gold-strong)]">
                      {t('onboardingReady', {
                        count: Math.min(
                          onboardingSaveProgress.savedCount,
                          onboardingSaveProgress.target,
                        ),
                        target: onboardingSaveProgress.target,
                      })}
                    </span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-3 gap-1.5 lg:mt-2" aria-hidden="true">
                    {Array.from({ length: onboardingSaveProgress.target }, (_, index) => (
                      <span
                        key={index}
                        className={`h-1.5 rounded-full transition-colors duration-300 ${
                          index < onboardingSaveProgress.savedCount ? 'bg-primary' : 'bg-border'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}
              {!compact && secondaryActions}
            </div>
          )}
        </>
      )}
    </div>
  );

  if (typeof document === 'undefined') return null;
  if (docked) return content;
  return createPortal(content, document.body);
}
