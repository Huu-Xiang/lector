'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getSetting, setDailyGoal } from '@/lib/data-layer';
import { DAILY_GOAL_PRESETS, DEFAULT_DAILY_GOAL, goalFromKey, goalKey } from '@/lib/daily-goal';

export default function DailyGoalSettings() {
  const t = useTranslations('dailyGoal');
  const [goal, setGoal] = useState(DEFAULT_DAILY_GOAL);

  useEffect(() => {
    getSetting<{ kind?: string; target?: number } | null>('dailyGoal')
      .then((stored) => {
        const known = stored && goalFromKey(`${stored.kind}:${stored.target}`);
        if (known) setGoal(known);
      })
      .catch(() => undefined);
  }, []);

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
        {DAILY_GOAL_PRESETS.map((preset) => (
          <option key={goalKey(preset)} value={goalKey(preset)}>
            {t(`preset.${preset.kind}`, { count: preset.target })}
          </option>
        ))}
      </select>
    </section>
  );
}
