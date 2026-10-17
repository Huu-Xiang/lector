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
import { Select } from '@/components/ui/select';

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
    <div data-testid="native-language-settings">
      <h3 className="mb-1 text-sm font-semibold text-foreground">{t('title')}</h3>
      <p className="mb-3 text-sm text-muted-foreground">{t('description')}</p>
      <Select
        value={value}
        disabled={pending}
        onChange={(e) => save(e.target.value)}
        aria-label={t('title')}
        data-testid="native-language-select"
        className="w-full"
      >
        {NATIVE_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.native}
            {lang.native !== lang.name ? ` (${lang.name})` : ''}
          </option>
        ))}
      </Select>
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
    </div>
  );
}
