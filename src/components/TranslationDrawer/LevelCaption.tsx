'use client';

import { useTranslations } from 'next-intl';

export function LevelCaption() {
  const t = useTranslations('reader.drawer');
  return (
    <p className="text-xs text-muted-foreground" data-testid="word-level-caption">
      {t('levelCaption')}
    </p>
  );
}
