'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { toast } from 'sonner';
import { getReviewGoal, getSetting, setReviewGoal, setSetting } from '@/lib/data-layer';
import {
  isWordHighlightMode,
  WORD_HIGHLIGHT_MODES,
  type WordHighlightMode,
} from '@/components/MarkdownReader/theme';
import type { ReviewGoal } from '@/types';
import { SETTINGS_KEYS } from '../../constants';
import ProductEmails from './ProductEmails';

const REVIEW_GOALS: ReviewGoal[] = ['recognize', 'recognize_spell'];

export default function PracticeSettings() {
  const t = useTranslations('settings.practice');
  const [hideTranslation, setHideTranslation] = useState(false);
  const [goal, setGoal] = useState<ReviewGoal>('recognize');
  const [autoSave, setAutoSave] = useState(false);
  const autoSaveTouched = useRef(false);
  const [autoPronounce, setAutoPronounce] = useState(false);
  const autoPronounceRef = useRef(false);
  autoPronounceRef.current = autoPronounce;
  const autoPronounceVersionRef = useRef(0);
  const [highlightMode, setHighlightMode] = useState<WordHighlightMode>('saved');
  const highlightModeRef = useRef<WordHighlightMode>('saved');
  highlightModeRef.current = highlightMode;
  const highlightModeVersionRef = useRef(0);

  useEffect(() => {
    const load = () =>
      setHideTranslation(localStorage.getItem(SETTINGS_KEYS.HIDE_TRANSLATION) === 'true');
    load();
    getReviewGoal()
      .then(setGoal)
      .catch(() => undefined);
    getSetting<boolean | null>('autoSaveLookups')
      .then((value) => {
        // A failed read is undefined; a tap made before the read wins.
        if (value !== undefined && !autoSaveTouched.current) setAutoSave(value === true);
      })
      .catch(() => undefined);
    const pronounceVersion = autoPronounceVersionRef.current;
    getSetting<boolean | null>('autoPronounceOnLookup')
      .then((value) => {
        if (value !== undefined && autoPronounceVersionRef.current === pronounceVersion) {
          setAutoPronounce(value === true);
        }
      })
      .catch(() => undefined);
    const highlightVersion = highlightModeVersionRef.current;
    getSetting<string | null>('wordHighlightMode')
      .then((value) => {
        if (value !== undefined && highlightModeVersionRef.current === highlightVersion) {
          setHighlightMode(isWordHighlightMode(value) ? value : 'saved');
        }
      })
      .catch(() => undefined);
  }, []);

  const handleAutoSaveChanged = async (next: boolean) => {
    autoSaveTouched.current = true;
    const previous = autoSave;
    setAutoSave(next);
    try {
      await setSetting('autoSaveLookups', next);
    } catch {
      setAutoSave(previous);
      toast.error(t('autoSaveFailed'));
    }
  };

  const handleAutoPronounceChanged = async (next: boolean) => {
    const myVersion = ++autoPronounceVersionRef.current;
    const previous = autoPronounceRef.current;
    autoPronounceRef.current = next;
    setAutoPronounce(next);
    try {
      await setSetting('autoPronounceOnLookup', next);
    } catch {
      if (autoPronounceVersionRef.current === myVersion) {
        autoPronounceRef.current = previous;
        setAutoPronounce(previous);
        toast.error(t('autoSaveFailed'));
      }
    }
  };

  const handleHighlightModeChanged = async (next: WordHighlightMode) => {
    const myVersion = ++highlightModeVersionRef.current;
    const previous = highlightModeRef.current;
    highlightModeRef.current = next;
    setHighlightMode(next);
    try {
      await setSetting('wordHighlightMode', next);
    } catch {
      if (highlightModeVersionRef.current === myVersion) {
        highlightModeRef.current = previous;
        setHighlightMode(previous);
        toast.error(t('autoSaveFailed'));
      }
    }
  };

  const handleGoalChanged = async (next: ReviewGoal) => {
    const previous = goal;
    setGoal(next);
    try {
      await setReviewGoal(next);
    } catch {
      setGoal(previous);
      toast.error(t('reviewGoalFailed'));
    }
  };

  const handleHideTranslationChanged = (hide: boolean) => {
    setHideTranslation(hide);
    localStorage.setItem(SETTINGS_KEYS.HIDE_TRANSLATION, String(hide));
  };

  return (
    <section className="panel p-6">
      <h2 className="mb-4 text-lg font-semibold text-foreground">{t('title')}</h2>

      {/* Cloze settings sub-section */}
      <h3 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {t('clozeHeading')}
      </h3>
      <div>
        <label className="block text-sm font-medium text-foreground">{t('translationLabel')}</label>
        <p className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {t.rich('translationHint', {
            keys: () => (
              <KbdGroup>
                <Kbd>Alt</Kbd>
                <Kbd>T</Kbd>
              </KbdGroup>
            ),
          })}
        </p>
        <div className="flex gap-2">
          <Button
            onClick={() => handleHideTranslationChanged(false)}
            variant={hideTranslation ? 'secondary' : 'default'}
          >
            {t('shown')}
          </Button>
          <Button
            onClick={() => handleHideTranslationChanged(true)}
            variant={hideTranslation ? 'default' : 'secondary'}
          >
            {t('hidden')}
          </Button>
        </div>
      </div>

      <div id="review-goal" className="mt-8 scroll-mt-20" data-testid="review-goal">
        <h3 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {t('wordReviewHeading')}
        </h3>
        <label className="block text-sm font-medium text-foreground">{t('reviewGoalLabel')}</label>
        <div className="mt-2 space-y-3" role="group" aria-label={t('reviewGoalLabel')}>
          {REVIEW_GOALS.map((value) => (
            <div key={value}>
              <Button
                aria-pressed={goal === value}
                data-testid={`review-goal-${value}`}
                onClick={() => void handleGoalChanged(value)}
                variant={goal === value ? 'default' : 'secondary'}
              >
                {t(`reviewGoal.${value}`)}
              </Button>
              <p className="mt-1.5 text-xs text-muted-foreground">{t(`reviewGoalHint.${value}`)}</p>
            </div>
          ))}
        </div>

        <label className="mt-6 block text-sm font-medium text-foreground">
          {t('autoSaveLabel')}
        </label>
        <p className="mb-2 text-xs text-muted-foreground">{t('autoSaveHint')}</p>
        <div className="flex gap-2" role="group" aria-label={t('autoSaveLabel')}>
          <Button
            aria-pressed={autoSave}
            data-testid="auto-save-lookups-on"
            onClick={() => void handleAutoSaveChanged(true)}
            variant={autoSave ? 'default' : 'secondary'}
          >
            {t('autoSaveOn')}
          </Button>
          <Button
            aria-pressed={!autoSave}
            data-testid="auto-save-lookups-off"
            onClick={() => void handleAutoSaveChanged(false)}
            variant={autoSave ? 'secondary' : 'default'}
          >
            {t('autoSaveOff')}
          </Button>
        </div>

        <label className="mt-6 block text-sm font-medium text-foreground">
          {t('autoPronounceLabel')}
        </label>
        <p className="mb-2 text-xs text-muted-foreground">{t('autoPronounceHint')}</p>
        <div className="flex gap-2" role="group" aria-label={t('autoPronounceLabel')}>
          <Button
            aria-pressed={autoPronounce}
            data-testid="auto-pronounce-on"
            onClick={() => void handleAutoPronounceChanged(true)}
            variant={autoPronounce ? 'default' : 'secondary'}
          >
            {t('autoSaveOn')}
          </Button>
          <Button
            aria-pressed={!autoPronounce}
            data-testid="auto-pronounce-off"
            onClick={() => void handleAutoPronounceChanged(false)}
            variant={autoPronounce ? 'secondary' : 'default'}
          >
            {t('autoSaveOff')}
          </Button>
        </div>

        <label className="mt-6 block text-sm font-medium text-foreground">
          {t('wordHighlightLabel')}
        </label>
        <p className="mb-2 text-xs text-muted-foreground">{t('wordHighlightHint')}</p>
        <div className="mt-2 space-y-3" role="group" aria-label={t('wordHighlightLabel')}>
          {WORD_HIGHLIGHT_MODES.map((mode) => (
            <div key={mode}>
              <Button
                aria-pressed={highlightMode === mode}
                data-testid={`word-highlight-mode-${mode}`}
                onClick={() => void handleHighlightModeChanged(mode)}
                variant={highlightMode === mode ? 'default' : 'secondary'}
              >
                {t(`wordHighlightMode.${mode}`)}
              </Button>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {t(`wordHighlightModeHint.${mode}`)}
              </p>
            </div>
          ))}
        </div>
      </div>

      <ProductEmails />
    </section>
  );
}
