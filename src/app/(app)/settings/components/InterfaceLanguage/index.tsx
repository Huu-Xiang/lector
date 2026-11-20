'use client';

import { useTranslations } from 'next-intl';
import UiLanguageSelect from '@/i18n/UiLanguageSelect';

export default function InterfaceLanguage({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('uiLanguage');
  const roles = useTranslations('settings.languageRoles');
  return (
    <div data-testid="interface-language-settings">
      <h3 className="mb-1 text-sm font-semibold text-foreground">
        {compact ? roles('app') : t('title')}
      </h3>
      <p
        className={
          compact ? 'mb-1 text-xs text-muted-foreground' : 'mb-3 text-sm text-muted-foreground'
        }
      >
        {compact ? roles('appHint') : t('description')}
      </p>
      <UiLanguageSelect
        accessibleLabel={compact ? roles('app') : undefined}
        className={compact ? 'min-h-11 w-full' : 'h-9 w-full text-base md:text-sm'}
      />
    </div>
  );
}
