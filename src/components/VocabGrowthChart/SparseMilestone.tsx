import { useFormatter, useTranslations } from 'next-intl';
import type { VocabDataPoint } from './types';

export default function SparseMilestone({
  known,
  learning,
  total,
}: Pick<VocabDataPoint, 'known' | 'learning' | 'total'>) {
  const t = useTranslations('stats.vocabGrowth');
  const format = useFormatter();
  const tracked = known + learning;
  return (
    <div data-testid="vocab-growth-sparse">
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            { label: 'knownWords', count: known },
            { label: 'learning', count: learning },
            { label: 'total', count: total },
          ] as const
        ).map(({ label, count }) => (
          <div key={label} className="rounded-xl bg-[var(--ios-fill)] px-2 py-3 text-center">
            <p className="text-xl font-semibold tabular-nums">{format.number(count)}</p>
            <p className="text-xs text-muted-foreground">{t(label)}</p>
          </div>
        ))}
      </div>
      <div
        className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-[var(--ios-fill)]"
        aria-hidden
      >
        <div
          className="h-full bg-primary"
          style={{ width: `${tracked > 0 ? (known / tracked) * 100 : 0}%` }}
        />
        <div
          className="h-full bg-[var(--gold-strong)]"
          style={{ width: `${tracked > 0 ? (learning / tracked) * 100 : 0}%` }}
        />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t('growthHint')}</p>
    </div>
  );
}
