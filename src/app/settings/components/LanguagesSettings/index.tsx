'use client';

import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { setSetting } from '@/lib/data-layer';
import {
  availableLanguages,
  LANGUAGES,
  normalizeEnabledLanguages,
  withLanguageDisabled,
  withLanguageEnabled,
  withoutNative,
} from '@/lib/languages';
import { useNativeLanguage } from '@/lib/library-titles';
import { isLanguageReady, parseReadyLanguages } from '@/lib/ready-languages';
import { useReadyLanguagesSetting } from '@/lib/use-env';
import type { LanguageCode } from '@/types/language';
import { useActiveLanguage, useEnabledLanguages } from '@/utils/hooks';
import { notifyLanguageListChanged } from '@/utils/storage';
import { Select } from '@/components/ui/select';

export default function LanguagesSettings() {
  const t = useTranslations('settings.languages');
  const tChrome = useTranslations('chrome.language');
  const ready = parseReadyLanguages(useReadyLanguagesSetting());
  const native = useNativeLanguage();
  const activeLang = useActiveLanguage();
  const enabledCodes = useEnabledLanguages();
  const [pending, setPending] = useState(false);
  const [adding, setAdding] = useState<LanguageCode | ''>('');

  const listed = normalizeEnabledLanguages([...enabledCodes, activeLang.code]);
  const addable = withoutNative(availableLanguages(listed), native);

  async function save(next: LanguageCode[], message: string) {
    setPending(true);
    try {
      await setSetting('enabledLanguages', next);
      notifyLanguageListChanged();
      toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('saveFailed'));
    } finally {
      setPending(false);
    }
  }

  async function add() {
    if (!adding) return;
    const code = adding;
    setAdding('');
    await save(withLanguageEnabled(listed, code), t('added', { language: LANGUAGES[code].native }));
  }

  async function remove(code: LanguageCode) {
    await save(
      withLanguageDisabled(listed, code),
      t('removed', { language: LANGUAGES[code].native }),
    );
  }

  return (
    <section className="panel p-6" data-testid="languages-settings">
      <h2 className="mb-1 text-lg font-semibold text-foreground">{t('title')}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{t('description')}</p>

      <ul className="mb-4 divide-y divide-border">
        {listed.map((code) => (
          <li
            key={code}
            data-testid={`enabled-language-${code}`}
            className="flex items-center gap-3 py-2"
          >
            <span className="text-lg">{LANGUAGES[code].flag}</span>
            <span className="flex-1 text-sm text-foreground">{LANGUAGES[code].native}</span>
            {code === activeLang.code ? (
              <span className="text-xs text-muted-foreground">{t('inUse')}</span>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={pending}
                aria-label={t('remove', { language: LANGUAGES[code].native })}
                data-testid={`remove-language-${code}`}
                onClick={() => remove(code)}
              >
                <X />
              </Button>
            )}
          </li>
        ))}
      </ul>

      {addable.length > 0 && (
        <div className="flex gap-2">
          <Select
            wrapperClassName="flex-1"
            value={adding}
            data-testid="add-language-select"
            onChange={(event) => setAdding(event.target.value as LanguageCode | '')}
          >
            <option value="">{t('addPlaceholder')}</option>
            {addable.map((code) => (
              <option key={code} value={code} disabled={!isLanguageReady(code, ready)}>
                {LANGUAGES[code].native}
                {isLanguageReady(code, ready) ? '' : ` (${tChrome('inDevelopment')})`}
              </option>
            ))}
          </Select>
          <Button disabled={pending || !adding} data-testid="add-language" onClick={add}>
            <Plus />
            {t('add')}
          </Button>
        </div>
      )}
    </section>
  );
}
