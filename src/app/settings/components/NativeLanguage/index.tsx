'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { languageDisplayName } from '@/lib/language-names';
import { toast } from 'sonner';
import { getSetting } from '@/lib/data-layer';
import { saveNativeLanguage } from '@/lib/library-titles';
import { useActiveLanguage } from '@/utils/hooks';
import {
  DEFAULT_NATIVE_LANGUAGE,
  isNativeLanguageCode,
  learnCodeOfNative,
  NATIVE_LANGUAGES,
  nativeLanguageFromLocale,
} from '@/lib/languages';

export default function NativeLanguage() {
  const t = useTranslations('settings.nativeLanguage');
  const activeLang = useActiveLanguage();
  const locale = useLocale();
  const [value, setValue] = useState<string>(DEFAULT_NATIVE_LANGUAGE);
  const [saved, setSaved] = useState(true);
  const [pending, setPending] = useState(false);
  const detected = nativeLanguageFromLocale(
    typeof navigator === 'undefined' ? undefined : navigator.language,
  );

  useEffect(() => {
    let cancelled = false;
    getSetting<string>('nativeLanguage')
      .then((stored) => {
        if (cancelled) return;
        if (isNativeLanguageCode(stored)) setValue(stored);
        else setSaved(false);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(next: string) {
    setValue(next);
    setPending(true);
    try {
      await saveNativeLanguage(next);
      setSaved(true);
      toast.success(t('saved'));
      if (learnCodeOfNative(next) === activeLang.code) {
        toast.warning(
          t('sameAsLearning', {
            language: languageDisplayName(activeLang.code, locale, activeLang.name),
          }),
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errSave'));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel p-6" data-testid="native-language-settings">
      <h2 className="mb-1 text-lg font-semibold text-foreground">{t('title')}</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Translations, explanations, tutor replies and journal feedback are written in this language.
        Built-in dictionary entries stay in English.
      </p>
      <select
        value={value}
        disabled={pending}
        onChange={(e) => save(e.target.value)}
        aria-label={t('title')}
        data-testid="native-language-select"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
      >
        {NATIVE_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.native}
            {lang.native !== lang.name ? ` (${lang.name})` : ''}
          </option>
        ))}
      </select>
      {!saved && detected !== value && (
        <button
          type="button"
          onClick={() => save(detected)}
          disabled={pending}
          className="mt-3 text-sm font-medium text-primary hover:underline"
        >
          {t('useBrowser')}
        </button>
      )}
    </section>
  );
}
