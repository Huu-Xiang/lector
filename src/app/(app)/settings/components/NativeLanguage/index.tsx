'use client';

import { useEffect, useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { languageDisplayName } from '@/lib/language-names';
import { toast } from 'sonner';
import { loadNative, saveNativeLanguage, useNativeLanguage } from '@/lib/library-titles';
import { useActiveLanguage } from '@/utils/hooks';
import {
  isNativeLanguageCode,
  learnCodeOfNative,
  NATIVE_LANGUAGES,
  nativeLanguageFromLocale,
} from '@/lib/languages';
import { Select } from '@/components/ui/select';

export default function NativeLanguage({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('settings.nativeLanguage');
  const roles = useTranslations('settings.languageRoles');
  const activeLang = useActiveLanguage();
  const locale = useLocale();
  const value = useNativeLanguage();
  const hint = useId();
  const [saved, setSaved] = useState(true);
  const [pending, setPending] = useState(false);
  const detected = nativeLanguageFromLocale(
    typeof navigator === 'undefined' ? undefined : navigator.language,
  );

  useEffect(() => {
    let cancelled = false;
    loadNative()
      .then((stored) => {
        if (cancelled) return;
        setSaved(isNativeLanguageCode(stored));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [value]);

  async function save(next: string) {
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
      <h3 className="mb-1 text-sm font-semibold text-foreground">
        {compact ? roles('definition') : t('title')}
      </h3>
      <p
        id={hint}
        className={
          compact ? 'mb-1 text-xs text-muted-foreground' : 'mb-3 text-sm text-muted-foreground'
        }
      >
        {compact ? roles('definitionHint') : t('description')}
      </p>
      <Select
        value={value}
        disabled={pending}
        onChange={(e) => save(e.target.value)}
        aria-label={compact ? roles('definition') : t('title')}
        aria-describedby={hint}
        data-testid="native-language-select"
        className={compact ? 'min-h-11 w-full' : 'w-full'}
      >
        {NATIVE_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.native}
            {!compact && lang.native !== lang.name ? ` (${lang.name})` : ''}
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
