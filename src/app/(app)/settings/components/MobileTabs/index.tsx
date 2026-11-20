'use client';

import { useTranslations } from 'next-intl';
import { Select } from '@/components/ui/select';
import { OPTIONAL_TABS, parseOptionalTab } from '@/components/NativeBridge/tab-bar';
import { useTabPreference } from '@/components/NativeBridge/use-tab-preference';

export default function MobileTabs() {
  const t = useTranslations('settings.mobileTabs');
  const nav = useTranslations('nav');
  const [extra, setExtra] = useTabPreference();

  return (
    <section className="panel space-y-3 p-4" aria-labelledby="mobile-tabs-title">
      <h2 id="mobile-tabs-title" className="text-lg font-semibold">
        {t('title')}
      </h2>
      <div className="space-y-2">
        <label htmlFor="mobile-extra-tab" className="block text-sm font-medium">
          {t('extra')}
        </label>
        <Select
          id="mobile-extra-tab"
          value={extra}
          onChange={(event) => setExtra(parseOptionalTab(event.target.value))}
          aria-describedby="mobile-tabs-hint"
          className="min-h-11"
        >
          <option value="none">{t('none')}</option>
          {Object.entries(OPTIONAL_TABS).map(([value, tab]) => (
            <option key={value} value={value}>
              {nav(tab.labelKey)}
            </option>
          ))}
        </Select>
        <p id="mobile-tabs-hint" className="text-sm text-muted-foreground">
          {t('hint')}
        </p>
      </div>
    </section>
  );
}
