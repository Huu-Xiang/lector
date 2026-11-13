'use client';

import { useTranslations } from 'next-intl';
import UiLanguageSelect from '@/i18n/UiLanguageSelect';

export default function InterfaceLanguage({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('uiLanguage');
  return (
    <div data-testid="interface-language-settings">
      <h3 className="mb-1 text-sm font-semibold text-foreground">{t('title')}</h3>
      {!compact && <p className="mb-3 text-sm text-muted-foreground">{t('description')}</p>}
      <UiLanguageSelect
        className={compact ? 'min-h-11 w-full' : 'h-9 w-full text-base md:text-sm'}
      />
    </div>
  );
}
