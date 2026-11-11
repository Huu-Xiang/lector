'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { toast } from 'sonner';
import { getReviewGoal, getSetting, setReviewGoal, setSetting } from '@/lib/data-layer';
import type { ReviewGoal } from '@/types';
import { SETTINGS_KEYS } from '../../constants';
import ProductEmails from './ProductEmails';

const REVIEW_GOALS: ReviewGoal[] = ['recognize', 'recognize_spell'];

export default function PracticeSettings() {
  const t = useTranslations('settings.practice');
  const [hideTranslation, setHideTranslation] = useState(false);
  const [goal, setGoal] = useState<ReviewGoal>('recognize');
  const [autoSave, setAutoSave] = useState(true);

  useEffect(() => {
    const load = () =>
      setHideTranslation(localStorage.getItem(SETTINGS_KEYS.HIDE_TRANSLATION) === 'true');
    load();
    getReviewGoal()
      .then(setGoal)
      .catch(() => undefined);
    getSetting<boolean | null>('autoSaveLookups')
      .then((value) => setAutoSave(value !== false))
      .catch(() => undefined);
  }, []);

  const handleAutoSaveChanged = async (next: boolean) => {
    const previous = autoSave;
    setAutoSave(next);
    try {
      await setSetting('autoSaveLookups', next);
    } catch {
      setAutoSave(previous);
      toast.error(t('autoSaveFailed'));
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
      </div>

      <ProductEmails />
    </section>
  );
}
