'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import DailyGoalEditor from '@/components/DailyGoalEditor';
import { getStreak, peekStreak, setDailyGoal } from '@/lib/data-layer';
import { DAILY_GOAL_PRESETS, DEFAULT_DAILY_GOAL, goalFromKey, goalKey } from '@/lib/daily-goal';

export default function DailyGoalSettings({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('dailyGoal');
  const common = useTranslations('library.common');
  const [saved, setGoal] = useState(() => peekStreak()?.goal);
  const [failed, setFailed] = useState(false);
  const [attempt, retry] = useState(0);
  const goal = saved ?? DEFAULT_DAILY_GOAL;

  useEffect(() => {
    let live = true;
    getStreak({ fresh: compact })
      .then((status) => {
        if (live) setGoal(status.goal);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [attempt, compact]);

  const change = async (key: string) => {
    const next = goalFromKey(key);
    if (!next) return;
    const previous = goal;
    setGoal(next);
    try {
      await setDailyGoal(next);
    } catch {
      setGoal(previous);
      toast.error(t('saveFailed'));
    }
  };

  if (compact) {
    return (
      <section id="daily-goal" className="scroll-mt-20" data-testid="daily-goal-settings">
        {saved ? (
          <DailyGoalEditor
            onSaved={setGoal}
            trigger={
              <button
                type="button"
                data-testid="settings-daily-goal-edit"
                className="flex min-h-11 w-full flex-wrap items-center gap-x-2 px-3 py-2 text-start text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring active:bg-accent"
              >
                <span className="flex-1 font-semibold">{t('settingsLabel')}</span>
                <span className="text-xs text-muted-foreground">
                  {t(`preset.${goal.kind}`, { count: goal.target })}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            }
          />
        ) : (
          <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <span className="font-semibold">{t('settingsLabel')}</span>
            {failed ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setFailed(false);
                  retry((value) => value + 1);
                }}
              >
                {common('tryAgain')}
              </Button>
            ) : (
              <Spinner size="sm" label={t('settingsLabel')} />
            )}
          </div>
        )}
      </section>
    );
  }

  return (
    <section id="daily-goal" className="panel scroll-mt-20 p-6" data-testid="daily-goal-settings">
      <h2 className="mb-1 text-lg font-semibold text-foreground">{t('settingsLabel')}</h2>
      <p className="mb-3 text-sm text-muted-foreground">{t('settingsHint')}</p>
      <label htmlFor="daily-goal-select" className="sr-only">
        {t('settingsLabel')}
      </label>
      <select
        id="daily-goal-select"
        data-testid="settings-daily-goal"
        value={goalKey(goal)}
        onChange={(event) => void change(event.target.value)}
        className="h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
      >
        {!goalFromKey(goalKey(goal)) && (
          <option value={goalKey(goal)}>{t(`preset.${goal.kind}`, { count: goal.target })}</option>
        )}
        {DAILY_GOAL_PRESETS.map((preset) => (
          <option key={goalKey(preset)} value={goalKey(preset)}>
            {t(`preset.${preset.kind}`, { count: preset.target })}
          </option>
        ))}
      </select>
    </section>
  );
}
