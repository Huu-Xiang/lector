import { ChevronDown, ChevronUp } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { ClozeCollection, FluencyStats, WordState } from '@/lib/data-layer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Time-range options for the stats page. `days: null` means "all time".
export const RANGE_OPTIONS: { key: 'd30' | 'd90' | 'y1' | 'all'; days: number | null }[] = [
  { key: 'd30', days: 30 },
  { key: 'd90', days: 90 },
  { key: 'y1', days: 365 },
  { key: 'all', days: null },
];

// Segmented time-range control. Built from the ui/Button primitive rather than
// hand-rolled buttons, per the design-system guidance.
export function RangeSelector({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (days: number | null) => void;
}) {
  const t = useTranslations('stats.range');
  return (
    <div
      data-testid="stats-range-selector"
      className="inline-flex gap-0.5 rounded-lg bg-muted p-0.5"
    >
      {RANGE_OPTIONS.map((opt) => {
        const active = value === opt.days;
        return (
          <Button
            key={opt.key}
            size="xs"
            variant={active ? 'secondary' : 'ghost'}
            aria-pressed={active}
            className={cn(!active && 'text-muted-foreground')}
            onClick={() => onChange(opt.days)}
          >
            {t(opt.key)}
          </Button>
        );
      })}
    </div>
  );
}

// Stat card component
export function StatCard({
  label,
  value,
  sublabel,
  icon,
  color = 'blue',
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  icon?: React.ReactNode;
  color?: 'blue' | 'green' | 'yellow' | 'purple' | 'orange' | 'pink';
}) {
  const format = useFormatter();
  const textColors = {
    blue: 'text-primary',
    green: 'text-primary',
    yellow: 'text-[var(--gold-strong)]',
    purple: 'text-[var(--chart-3)]',
    orange: 'text-clay',
    pink: 'text-clay',
  };

  return (
    <div className="panel p-6 transition-transform hover:scale-[1.02]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className={`mt-1 text-4xl font-bold ${textColors[color]}`}>
            {typeof value === 'number' ? format.number(value) : value}
          </p>
          {sublabel && <p className="mt-1 text-sm text-muted-foreground">{sublabel}</p>}
        </div>
        {icon && <div className={`${textColors[color]} opacity-60`}>{icon}</div>}
      </div>
    </div>
  );
}

// Word state breakdown component
export function WordStateBreakdown({ byState }: { byState: Record<WordState, number> }) {
  const t = useTranslations('stats.states');
  const tw = useTranslations('stats.wordStates');
  const format = useFormatter();
  const states: { key: WordState; label: string; color: string; bgColor: string }[] = [
    {
      key: 'known',
      label: t('known'),
      color: 'text-primary',
      bgColor: 'bg-primary',
    },
    {
      key: 'level4',
      label: t('level4'),
      color: 'text-primary',
      bgColor: 'bg-[color-mix(in_srgb,var(--primary)_70%,#fff)]',
    },
    {
      key: 'level3',
      label: t('level3'),
      color: 'text-[var(--gold-strong)]',
      bgColor: 'bg-[var(--gold)]',
    },
    {
      key: 'level2',
      label: t('level2'),
      color: 'text-[var(--gold-strong)]',
      bgColor: 'bg-[color-mix(in_srgb,var(--gold)_80%,var(--clay))]',
    },
    {
      key: 'level1',
      label: t('level1'),
      color: 'text-clay',
      bgColor: 'bg-clay',
    },
    {
      key: 'new',
      label: t('new'),
      color: 'text-[var(--w-new-fg)]',
      bgColor: 'bg-[var(--chart-5)]',
    },
    {
      key: 'ignored',
      label: t('ignored'),
      color: 'text-muted-foreground',
      bgColor: 'bg-muted-foreground',
    },
  ];

  const total = Object.values(byState).reduce((a, b) => a + b, 0);

  return (
    <div className="panel p-6">
      <h3 className="mb-4 text-lg font-semibold text-foreground">{tw('title')}</h3>
      <div className="space-y-3">
        {states.map(({ key, label, color, bgColor }) => {
          const count = byState[key] || 0;
          const percentage = total > 0 ? (count / total) * 100 : 0;
          return (
            <div key={key}>
              <div className="mb-1 flex justify-between text-sm">
                <span className={color}>{label}</span>
                <span className="text-muted-foreground">
                  {format.number(count)} ({percentage.toFixed(1)}%)
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full ${bgColor} rounded-full transition-all duration-500`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Cloze stats component
export function ClozeStats({
  attempts,
  correct,
  points,
}: {
  attempts: number;
  correct: number;
  points: number;
}) {
  const t = useTranslations('stats.cloze');
  const format = useFormatter();
  const accuracy = attempts > 0 ? (correct / attempts) * 100 : 0;

  return (
    <div className="panel p-6">
      <h3 className="mb-4 text-lg font-semibold text-foreground">{t('title')}</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg bg-muted p-4 text-center">
          <div className="text-3xl font-bold text-[var(--chart-3)]">{format.number(attempts)}</div>
          <div className="mt-1 text-sm text-muted-foreground">{t('sentencesPracticed')}</div>
        </div>
        <div className="rounded-lg bg-muted p-4 text-center">
          <div className="text-3xl font-bold text-primary">{accuracy.toFixed(1)}%</div>
          <div className="mt-1 text-sm text-muted-foreground">{t('accuracy')}</div>
        </div>
        <div className="col-span-2 rounded-lg bg-muted p-4 text-center">
          <div className="text-3xl font-bold text-[var(--gold-strong)]">
            {format.number(points)}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">{t('totalPoints')}</div>
        </div>
      </div>
    </div>
  );
}

// Sentence mastery component
export function SentenceMastery({
  collectionCounts,
}: {
  collectionCounts: Record<ClozeCollection, { total: number; due: number; mastered: number }>;
}) {
  const t = useTranslations('stats.mastery');
  const format = useFormatter();
  const collectionLabels: Record<string, string> = {
    top500: t('collections.top500'),
    top1000: t('collections.top1000'),
    top2000: t('collections.top2000'),
    mined: t('collections.mined'),
    random: t('collections.random'),
  };

  const collections = Object.entries(collectionCounts).filter(([, counts]) => counts.total > 0);

  const overallTotal = collections.reduce((sum, [, c]) => sum + c.total, 0);
  const overallMastered = collections.reduce((sum, [, c]) => sum + c.mastered, 0);
  const overallPercentage = overallTotal > 0 ? (overallMastered / overallTotal) * 100 : 0;

  return (
    <div className="panel p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">{t('title')}</h3>
        <span className="text-sm font-medium text-primary">
          {t('overall', { percent: overallPercentage.toFixed(1) })}
        </span>
      </div>

      {/* Overall progress bar */}
      <div className="mb-6">
        <div className="mb-1 flex justify-between text-sm">
          <span className="text-muted-foreground">
            {t('mastered', {
              mastered: format.number(overallMastered),
              total: format.number(overallTotal),
            })}
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[color-mix(in_srgb,var(--primary)_55%,#fff)] to-primary transition-all duration-500"
            style={{ width: `${overallPercentage}%` }}
          />
        </div>
      </div>

      {/* Per-collection breakdown */}
      <div className="space-y-4">
        {collections.map(([collection, counts]) => {
          const pct = counts.total > 0 ? (counts.mastered / counts.total) * 100 : 0;
          return (
            <div key={collection}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-medium text-foreground">
                  {collectionLabels[collection] || collection}
                </span>
                <span className="text-muted-foreground">
                  {counts.mastered} / {counts.total} ({pct.toFixed(0)}%)
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[color-mix(in_srgb,var(--primary)_55%,#fff)] to-primary transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {counts.due > 0 && (
                <p className="mt-0.5 text-xs text-[var(--gold-strong)]">
                  {t('due', { count: counts.due })}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Fluency badge component
export function FluencyBadge({ fluency }: { fluency: FluencyStats }) {
  const t = useTranslations('stats.fluency');
  const format = useFormatter();
  const {
    estimatedLevel,
    nextLevel,
    progressToNextLevel,
    wordsToNextLevel,
    totalKnownWords,
    totalLearning,
    weeklyGrowth,
  } = fluency;
  const growthDelta = weeklyGrowth.delta;

  return (
    <div data-testid="fluency-section" className="panel mb-8 p-6">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span
            data-testid="fluency-level-badge"
            className="inline-flex items-center rounded-lg bg-[var(--primary-soft)] px-4 py-2 text-lg font-bold text-[var(--primary-text)]"
          >
            {estimatedLevel.code}
          </span>
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              {estimatedLevel.code} &mdash; {estimatedLevel.label}
            </h3>
            <p className="text-sm text-muted-foreground">{t('estimatedLevel')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {growthDelta !== 0 && (
            <span
              data-testid="fluency-weekly-growth"
              className={`inline-flex items-center gap-1 text-sm font-medium ${
                growthDelta > 0 ? 'text-primary' : 'text-destructive'
              }`}
            >
              {growthDelta > 0 ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              {t('vsLastWeek', { count: Math.abs(growthDelta) })}
            </span>
          )}
          {growthDelta === 0 && weeklyGrowth.thisWeek > 0 && (
            <span className="text-sm text-muted-foreground">
              {t('sameAsLast', { count: weeklyGrowth.thisWeek })}
            </span>
          )}
        </div>
      </div>

      {/* Progress bar toward next level */}
      <div className="mb-4">
        <div className="mb-1 flex justify-between text-sm">
          <span className="text-muted-foreground">
            {nextLevel ? t('progressTo', { level: nextLevel.code }) : t('topLevel')}
          </span>
          <span className="text-muted-foreground">{progressToNextLevel}%</span>
        </div>
        <div
          data-testid="fluency-progress-bar"
          className="h-3 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-[color-mix(in_srgb,var(--primary)_55%,#fff)] to-primary transition-all duration-500"
            style={{ width: `${progressToNextLevel}%` }}
          />
        </div>
        {nextLevel && (
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>{format.number(estimatedLevel.min)}</span>
            <span data-testid="fluency-words-to-next" className="font-medium text-foreground">
              {t('wordsToNext', {
                count: wordsToNextLevel ?? 0,
                level: nextLevel.code,
              })}
            </span>
            <span>
              {estimatedLevel.max != null ? format.number(estimatedLevel.max) : undefined}
            </span>
          </div>
        )}
      </div>

      {/* Known / Learning counts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg bg-muted p-3 text-center">
          <div data-testid="fluency-known-count" className="text-2xl font-bold text-primary">
            {format.number(totalKnownWords)}
          </div>
          <div className="text-sm text-muted-foreground">{t('known')}</div>
        </div>
        <div className="rounded-lg bg-muted p-3 text-center">
          <div
            data-testid="fluency-learning-count"
            className="text-2xl font-bold text-[var(--gold-strong)]"
          >
            {format.number(totalLearning)}
          </div>
          <div className="text-sm text-muted-foreground">{t('learning')}</div>
        </div>
      </div>
    </div>
  );
}

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />;
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`panel p-6 ${className}`}>
      <SkeletonBlock className="mb-3 h-4 w-24" />
      <SkeletonBlock className="mb-2 h-10 w-32" />
      <SkeletonBlock className="h-3 w-20" />
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-8" data-testid="stats-skeleton">
      <SkeletonBlock className="mb-6 h-4 w-56" />

      {/* Fluency badge skeleton */}
      <div className="panel mb-8 p-6">
        <div className="mb-4 flex items-center gap-4">
          <SkeletonBlock className="h-10 w-16" />
          <div className="flex-1">
            <SkeletonBlock className="mb-2 h-5 w-48" />
            <SkeletonBlock className="h-4 w-32" />
          </div>
        </div>
        <SkeletonBlock className="mb-4 h-3 w-full" />
        <div className="grid grid-cols-2 gap-4">
          <SkeletonBlock className="h-16" />
          <SkeletonBlock className="h-16" />
        </div>
      </div>

      {/* Top stat cards skeleton */}
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>

      {/* Vocab growth chart skeleton */}
      <SkeletonBlock className="mb-8 h-72" />

      {/* Activity heatmap skeleton */}
      <SkeletonBlock className="mb-8 h-56" />

      {/* Detailed breakdowns skeleton */}
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        <SkeletonBlock className="h-72" />
        <SkeletonBlock className="h-72" />
      </div>

      {/* Sentence mastery skeleton */}
      <SkeletonBlock className="h-64" />
    </main>
  );
}
