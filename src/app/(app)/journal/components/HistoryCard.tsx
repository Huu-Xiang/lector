import { Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { JournalEntry } from '@/lib/data-layer';
import { formatDateTime } from '../utils';

export default function HistoryCard({
  entry,
  onSelect,
  onDelete,
}: {
  entry: JournalEntry;
  onSelect: (e: JournalEntry) => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations('journal.card');
  const locale = useLocale();
  const preview = entry.body.length > 120 ? entry.body.slice(0, 120) + '…' : entry.body;
  const correctionCount = entry.corrections?.length ?? 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(entry)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(entry);
        }
      }}
      className="cursor-pointer rounded-lg border border-border p-4 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">
          {formatDateTime(entry.createdAt, locale)}
        </span>
        <div className="flex items-center gap-2">
          {entry.status === 'submitted' ? (
            <span className="rounded-full bg-[color-mix(in_srgb,var(--primary)_14%,var(--card))] px-2 py-0.5 text-xs font-medium text-primary">
              {correctionCount > 0 ? t('corrections', { count: correctionCount }) : t('perfect')}
            </span>
          ) : (
            <span className="rounded-full bg-[var(--gold-soft)] px-2 py-0.5 text-xs font-medium text-[var(--gold-strong)]">
              {t('draft')}
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(entry.id);
            }}
            className="-m-1.5 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-destructive"
            title={t('deleteEntry')}
            aria-label={t('deleteEntry')}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <p className="native-subtitle line-clamp-2 text-sm text-muted-foreground">{preview}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t('words', { count: entry.wordCount })}</p>
    </div>
  );
}
