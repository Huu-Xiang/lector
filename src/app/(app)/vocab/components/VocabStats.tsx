import { useTranslations } from 'next-intl';
import { WordState } from '@/types';

export default function VocabStats({
  stats,
}: {
  stats: { total: number; byState: Record<WordState, number> };
}) {
  const t = useTranslations('vocab.stats');
  const learningCount =
    stats.byState.new +
    stats.byState.level1 +
    stats.byState.level2 +
    stats.byState.level3 +
    stats.byState.level4;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-lg bg-muted p-3">
        <div className="text-2xl font-bold text-foreground">{stats.total}</div>
        <div className="text-sm text-muted-foreground">{t('total')}</div>
      </div>
      <div className="rounded-lg bg-[var(--gold-soft)] p-3">
        <div className="text-2xl font-bold text-[var(--gold-strong)]">{learningCount}</div>
        <div className="text-sm text-[var(--gold-strong)]">{t('learning')}</div>
      </div>
      <div className="rounded-lg bg-[var(--primary-soft)] p-3">
        <div className="text-2xl font-bold text-primary">{stats.byState.known}</div>
        <div className="text-sm text-primary">{t('known')}</div>
      </div>
      <div className="rounded-lg bg-muted p-3">
        <div className="text-2xl font-bold text-muted-foreground">{stats.byState.ignored}</div>
        <div className="text-sm text-muted-foreground">{t('ignored')}</div>
      </div>
    </div>
  );
}
