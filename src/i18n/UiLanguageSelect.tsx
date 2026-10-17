'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Globe } from 'lucide-react';
import { toast } from 'sonner';
import { Select } from '@/components/ui/select';
import { loadNative, saveNativeLanguage } from '@/lib/library-titles';
import { NATIVE_LANGUAGES, nativeLanguageFromLocale } from '@/lib/languages';
import { LOCALE_COOKIE, UI_LOCALES } from './locales';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function writeLocaleCookie(code: string) {
  document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}

export default function UiLanguageSelect({
  className = '',
  showLabel = false,
}: {
  className?: string;
  /** Show a visible "Interface language" caption above the select. */
  showLabel?: boolean;
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('uiLanguage');

  function change(code: string) {
    writeLocaleCookie(code);
    router.refresh();
    void offerNativeSwitch(code);
  }

  // The interface language and the translation language are separate settings.
  // After a switch, offer to move the translation language too; signed-out visitors get nothing.
  async function offerNativeSwitch(code: string) {
    const wanted = nativeLanguageFromLocale(code);
    const saved = await loadNative();
    if (!saved || saved === wanted) return;
    const name = NATIVE_LANGUAGES.find((l) => l.code === wanted)?.native ?? wanted;
    toast(t('alsoNative', { language: name }), {
      duration: 15000,
      action: {
        label: t('alsoNativeYes'),
        onClick: () => {
          saveNativeLanguage(wanted).then(
            () => toast.success(t('alsoNativeDone')),
            () => toast.error(t('alsoNativeFailed')),
          );
        },
      },
      cancel: { label: t('alsoNativeNo'), onClick: () => {} },
    });
  }

  return (
    <div>
      {showLabel && <p className="mb-1 text-xs text-muted-foreground">{t('label')}</p>}
      <div className="relative">
        <Globe
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Select
          value={locale}
          onChange={(e) => change(e.target.value)}
          aria-label={t('label')}
          title={t('label')}
          data-testid="ui-language-select"
          className={`h-8 py-0 pl-8 text-xs md:text-xs ${className}`}
        >
          {UI_LOCALES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.native}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
