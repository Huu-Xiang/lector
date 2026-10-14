'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
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
    <select
      value={locale}
      onChange={(e) => change(e.target.value)}
      aria-label={t('label')}
      data-testid="ui-language-select"
      className={`rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none ${className}`}
    >
      {UI_LOCALES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.native}
        </option>
      ))}
    </select>
  );
}
