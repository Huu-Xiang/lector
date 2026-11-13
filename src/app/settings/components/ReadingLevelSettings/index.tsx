'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import ReadingLevelPicker, { VocabTestLink } from '@/components/ReadingLevelPicker';
import { getSetting } from '@/lib/data-layer';
import { LANGUAGES } from '@/lib/languages';
import { levelFor, setReadingLevel, type CefrLevel } from '@/lib/reading-level';
import { useEnabledLanguages } from '@/utils/hooks';

/** One A1-C2 picker per learning language; it sets the level that book picks follow. */
export default function ReadingLevelSettings() {
  const t = useTranslations('settings.readingLevel');
  const languages = useEnabledLanguages();
  const [levels, setLevels] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSetting<Record<string, string>>('readingLevels')
      .then((stored) => {
        if (!cancelled) setLevels(stored ?? {});
      })
      .catch(() => {
        if (!cancelled) setLevels({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function pick(language: string, level: CefrLevel) {
    setSaving(language);
    try {
      await setReadingLevel(language, level);
      setLevels((current) => ({ ...(current ?? {}), [language]: level }));
      toast.success(
        t('saved', { language: LANGUAGES[language as keyof typeof LANGUAGES].native, level }),
      );
    } catch {
      toast.error(t('saveFailed'));
    } finally {
      setSaving(null);
    }
  }

  if (levels === null || languages.length === 0) return null;

  return (
    <section className="panel space-y-5 p-6" data-testid="reading-level-settings">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-foreground">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('hint')}</p>
      </div>
      {languages.map((code) => {
        const language = LANGUAGES[code];
        return (
          <div key={code} className="space-y-2" data-testid={`reading-level-${code}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">
                <span className="language-emoji mr-2" aria-hidden="true">
                  {language.flag}
                </span>
                {language.native}
              </p>
              {code === 'en' && <VocabTestLink from="settings" testId="settings-vocab-test-link" />}
            </div>
            <ReadingLevelPicker
              level={levelFor(levels, code)}
              onPick={(level) => void pick(code, level)}
              disabled={saving === code}
              label={t('pickerLabel', { language: language.native })}
              testIdPrefix={`reading-level-${code}`}
            />
          </div>
        );
      })}
    </section>
  );
}
