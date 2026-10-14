'use client';

import { useTranslations } from 'next-intl';

export default function AnkiStatus({
  pushedToAnki,
  ankiNoteId,
}: {
  pushedToAnki: boolean;
  ankiNoteId?: number;
}) {
  const t = useTranslations('stats.ankiStatus');
  if (pushedToAnki) {
    return (
      <span
        className="inline-flex items-center rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-xs font-medium text-primary"
        title={ankiNoteId ? t('noteId', { id: ankiNoteId }) : t('pushed')}
      >
        {t('synced')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {t('notSynced')}
    </span>
  );
}
