'use client';

import { useTranslations } from 'next-intl';
import UiLanguageSelect from '@/i18n/UiLanguageSelect';

export default function InterfaceLanguage() {
  const t = useTranslations('uiLanguage');
  return (
    <section className="panel p-6" data-testid="interface-language-settings">
      <h2 className="mb-1 text-lg font-semibold text-foreground">{t('title')}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{t('description')}</p>
      <UiLanguageSelect className="w-full px-3 py-2 text-sm" />
    </section>
  );
}
