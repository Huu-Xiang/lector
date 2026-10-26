'use client';

import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { parseLemmaLabel, posKey } from '../labels';

export function usePosLabel(): (pos: string) => string {
  const locale = useLocale();
  const t = useTranslations('reader.drawer.pos');
  return (pos) => {
    if (locale === 'en') return pos;
    const key = posKey(pos);
    return key ? t(key) : pos;
  };
}

/** "plural of <stem>" in English; the translated relation, then the stem, elsewhere. */
export function LemmaLine({ label, stem }: { label: string; stem: ReactNode }) {
  const locale = useLocale();
  const t = useTranslations('reader.drawer.lemma');
  if (locale === 'en') {
    return (
      <>
        {label} {stem}
      </>
    );
  }
  const parsed = parseLemmaLabel(label);
  if (parsed.key === null) {
    return (
      <>
        {t('related')}
        {stem}
      </>
    );
  }
  return (
    <>
      {t(parsed.key)}
      {stem}
      {parsed.detail && t('ending', { ending: parsed.detail })}
    </>
  );
}
