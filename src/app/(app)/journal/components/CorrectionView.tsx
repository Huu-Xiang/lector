import { useTranslations } from 'next-intl';
import { JournalEntry } from '@/lib/data-layer';
import CorrectionBadge from './CorrectionBadge';
import HighlightedText from './HighlightedText';

export default function CorrectionView({ entry }: { entry: JournalEntry }) {
  const t = useTranslations('journal.correction');
  const corrections = entry.corrections || [];

  return (
    <div className="space-y-6">
      {/* Original with inline highlights */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">{t('yourText')}</h3>
        <div className="rounded-lg bg-muted p-4 text-sm leading-relaxed whitespace-pre-wrap">
          <HighlightedText body={entry.body} corrections={corrections} />
        </div>
        {corrections.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">{t('clickHint')}</p>
        )}
      </div>

      {/* Corrected version */}
      {entry.correctedBody && entry.correctedBody !== entry.body && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">{t('corrected')}</h3>
          <div className="rounded-lg border border-primary bg-[color-mix(in_srgb,var(--primary)_14%,var(--card))] p-4 text-sm leading-relaxed whitespace-pre-wrap">
            {entry.correctedBody}
          </div>
        </div>
      )}

      {/* Summary */}
      {corrections.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground">
            {t('summary', { count: corrections.length })}
          </span>
          {corrections.map((c, i) => (
            <CorrectionBadge key={i} type={c.type} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-primary bg-[color-mix(in_srgb,var(--primary)_14%,var(--card))] p-4 text-center">
          <p className="font-medium text-primary">{t('perfect')}</p>
        </div>
      )}
    </div>
  );
}
