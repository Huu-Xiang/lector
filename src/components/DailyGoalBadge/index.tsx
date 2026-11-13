'use client';

import { Flame } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getStreak, peekStreak, QUERY_SCOPES, setDailyGoal } from '@/lib/data-layer';
import { useIsNativeApp } from '@/lib/native-app';
import DailyGoalEditor from '@/components/DailyGoalEditor';
import { useQueryRefresh } from '@/lib/use-query-refresh';
import {
  DAILY_GOAL_PRESETS,
  DAILY_STATS_EVENT,
  goalFromKey,
  goalKey,
  type DailyGoal,
  type StreakStatus,
} from '@/lib/daily-goal';

const RING_RADIUS = 8;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

function ProgressRing({ fraction, met }: { fraction: number; met: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="size-5 -rotate-90" aria-hidden="true">
      <circle
        cx="10"
        cy="10"
        r={RING_RADIUS}
        fill="none"
        strokeWidth="2.5"
        className="stroke-muted"
      />
      <circle
        cx="10"
        cy="10"
        r={RING_RADIUS}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={RING_LENGTH}
        strokeDashoffset={RING_LENGTH * (1 - fraction)}
        className={`transition-[stroke-dashoffset] duration-700 ${met ? 'stroke-orange-500' : 'stroke-primary'}`}
      />
    </svg>
  );
}

/** Streak and today's goal progress; the menu shows the details and changes the goal. */
export default function DailyGoalBadge({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('dailyGoal');
  const nativeApp = useIsNativeApp();
  const [status, setStatus] = useState<StreakStatus | null>(() => peekStreak() ?? null);
  const [celebrating, setCelebrating] = useState(false);
  const [failed, setFailed] = useState(false);
  const metBefore = useRef<boolean | null>(null);

  const load = useCallback(() => {
    getStreak()
      .then((next) => {
        if (metBefore.current === false && next.goalMetToday) {
          toast.success(t('metToast', { count: next.streak }));
          setCelebrating(true);
          window.setTimeout(() => setCelebrating(false), 1600);
        }
        metBefore.current = next.goalMetToday;
        setStatus(next);
      })
      .catch(() => setFailed(true));
  }, [t]);

  useEffect(() => {
    load();
    window.addEventListener(DAILY_STATS_EVENT, load);
    return () => window.removeEventListener(DAILY_STATS_EVENT, load);
  }, [load]);
  useQueryRefresh([QUERY_SCOPES.dailyStats], load);

  // Same box as the badge while loading, so the header does not jump when it arrives.
  if (!status?.goal) {
    if (failed) return null;
    return (
      <span
        aria-hidden="true"
        data-testid="daily-goal-placeholder"
        className={`block h-9 shrink-0 rounded-full border border-border bg-card ${compact ? 'w-[4.75rem]' : 'w-36'}`}
      />
    );
  }
  const { goal, goalProgress, goalMetToday, streak, longest } = status;
  const shown = Math.min(goalProgress, goal.target);
  const amount = t(`amount.${goal.kind}`, { done: shown, target: goal.target });

  const changeGoal = async (key: string) => {
    const next = goalFromKey(key);
    if (!next) return;
    const previous = status;
    // A new goal must not read as "just met" and fire the celebration.
    metBefore.current = null;
    setStatus({ ...status, goal: next });
    try {
      await setDailyGoal(next);
    } catch {
      setStatus(previous);
      toast.error(t('saveFailed'));
    }
  };

  const badgeProps = {
    'data-testid': 'daily-goal-badge',
    'data-goal-met': goalMetToday ? 'true' : 'false',
    'aria-label': t('label', { count: streak, amount }),
    className: `relative flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors before:absolute before:-inset-1 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${celebrating ? 'motion-safe:animate-bounce' : ''}`,
  };
  const badgeContent = (
    <>
      <Flame
        aria-hidden="true"
        className={`size-4 ${goalMetToday ? 'fill-orange-400 text-orange-500' : 'text-muted-foreground'}`}
      />
      <span data-testid="daily-goal-streak">{streak}</span>
      <ProgressRing fraction={shown / goal.target} met={goalMetToday} />
      {!compact && (
        <span className="text-xs font-medium whitespace-nowrap text-muted-foreground">
          {amount}
        </span>
      )}
    </>
  );

  if (nativeApp) {
    return (
      <DailyGoalEditor
        showProgress
        trigger={
          <button type="button" {...badgeProps}>
            {badgeContent}
          </button>
        }
        onSaveStart={() => {
          metBefore.current = null;
        }}
      />
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger {...badgeProps}>{badgeContent}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64" data-testid="daily-goal-menu">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-sm text-foreground">
            {goalMetToday ? t('doneToday') : t('todayProgress', { amount })}
          </DropdownMenuLabel>
          <p className="px-2 pb-1 text-xs text-muted-foreground">
            {t('streakLine', { count: streak })} · {t('longestLine', { count: longest })}
          </p>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('changeGoal')}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={goalKey(goal)} onValueChange={changeGoal}>
            {DAILY_GOAL_PRESETS.map((preset: DailyGoal) => (
              <DropdownMenuRadioItem
                key={goalKey(preset)}
                value={goalKey(preset)}
                data-testid={`daily-goal-option-${goalKey(preset).replace(':', '-')}`}
              >
                {t(`preset.${preset.kind}`, { count: preset.target })}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
