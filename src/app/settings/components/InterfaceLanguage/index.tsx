'use client';

import { useTranslations } from 'next-intl';
import UiLanguageSelect from '@/i18n/UiLanguageSelect';

export default function InterfaceLanguage() {
  const t = useTranslations('uiLanguage');
  return (
    <div data-testid="interface-language-settings">
      <h3 className="mb-1 text-sm font-semibold text-foreground">{t('title')}</h3>
      <p className="mb-3 text-sm text-muted-foreground">{t('description')}</p>
      <UiLanguageSelect className="h-9 w-full text-base md:text-sm" />
    </div>
  );
}
