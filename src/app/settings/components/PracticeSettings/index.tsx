'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { SETTINGS_KEYS } from '../../constants';

export default function PracticeSettings() {
  const t = useTranslations('settings.practice');
  const [hideTranslation, setHideTranslation] = useState(false);

  useEffect(() => {
    const load = () =>
      setHideTranslation(localStorage.getItem(SETTINGS_KEYS.HIDE_TRANSLATION) === 'true');
    load();
  }, []);

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
    </section>
  );
}
