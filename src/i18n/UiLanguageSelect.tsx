'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Select } from '@/components/ui/select';
import { LOCALE_COOKIE, UI_LOCALES } from './locales';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export default function UiLanguageSelect({ className = '' }: { className?: string }) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('uiLanguage');

  function change(code: string) {
    document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
    router.refresh();
  }

  return (
    <Select
      value={locale}
      onChange={(e) => change(e.target.value)}
      aria-label={t('label')}
      data-testid="ui-language-select"
      className={`h-8 py-0 text-xs md:text-xs ${className}`}
    >
      {UI_LOCALES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.native}
        </option>
      ))}
    </Select>
  );
}
