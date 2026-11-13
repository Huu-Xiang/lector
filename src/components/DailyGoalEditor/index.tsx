'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { BookOpen, RotateCcw } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { getStreak, setDailyGoal } from '@/lib/data-layer';
import {
  DAILY_GOAL_PRESETS,
  goalKey,
  type DailyGoal,
  type DailyGoalKind,
  type StreakStatus,
} from '@/lib/daily-goal';

const types = [
  { kind: 'minutes', icon: BookOpen },
  { kind: 'reviews', icon: RotateCcw },
] as const;

export default function DailyGoalEditor({
  trigger,
  showProgress = false,
  onSaved,
  onSaveStart,
}: {
  trigger: ReactElement;
  showProgress?: boolean;
  onSaved?: (goal: DailyGoal) => void;
  onSaveStart?: () => void;
}) {
  const t = useTranslations('dailyGoal');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function save(next: DailyGoal, previous: DailyGoal) {
    if (goalKey(next) === goalKey(previous)) {
      setOpen(false);
      return;
    }
    setSaving(true);
    setError(false);
    try {
      onSaveStart?.();
      await setDailyGoal(next);
      onSaved?.(next);
      setOpen(false);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (saving) return;
        setOpen(next);
        if (next) setError(false);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent
        data-testid="daily-goal-editor"
        viewportClassName="items-end px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center"
        className="max-h-[calc(100dvh-2rem-env(safe-area-inset-bottom))] max-w-sm overflow-y-auto p-4 motion-reduce:transition-none"
      >
        <DialogTitle className="text-base">{t('changeGoal')}</DialogTitle>
        {open && (
          <GoalContent
            showProgress={showProgress}
            saving={saving}
            onSave={save}
            onCancel={() => setOpen(false)}
          />
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {t('saveFailed')}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function GoalContent({
  showProgress,
  saving,
  onSave,
  onCancel,
}: {
  showProgress: boolean;
  saving: boolean;
  onSave: (next: DailyGoal, previous: DailyGoal) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('dailyGoal');
  const common = useTranslations('library.common');
  const [status, setStatus] = useState<StreakStatus>();
  const [failed, setFailed] = useState(false);
  const [attempt, retry] = useState(0);

  useEffect(() => {
    let live = true;
    getStreak({ fresh: true })
      .then((next) => {
        if (live) setStatus(next);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  if (!status) {
    return (
      <div className="mt-3 flex items-center justify-between gap-2">
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
        <Button type="button" variant="ghost" onClick={onCancel}>
          {common('cancel')}
        </Button>
      </div>
    );
  }

  const { goal, goalMetToday, goalProgress, streak, longest } = status;
  const amount = t(`amount.${goal.kind}`, {
    done: Math.min(goalProgress, goal.target),
    target: goal.target,
  });
  return (
    <>
      {showProgress && (
        <p className="mt-1 text-xs text-muted-foreground">
          {goalMetToday ? t('doneToday') : t('todayProgress', { amount })}
          {' · '}
          {t('streakLine', { count: streak })}
          {' · '}
          {t('longestLine', { count: longest })}
        </p>
      )}
      <GoalForm
        goal={goal}
        saving={saving}
        onSave={(next) => onSave(next, goal)}
        onCancel={onCancel}
      />
    </>
  );
}

function GoalForm({
  goal,
  saving,
  onSave,
  onCancel,
}: {
  goal: DailyGoal;
  saving: boolean;
  onSave: (goal: DailyGoal) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('dailyGoal');
  const common = useTranslations('library.common');
  const [kind, setKind] = useState(goal.kind);
  const [amounts, setAmounts] = useState<Record<DailyGoalKind, number>>({
    minutes: goal.kind === 'minutes' ? goal.target : 5,
    reviews: goal.kind === 'reviews' ? goal.target : 10,
  });
  const targets = [
    ...new Set([
      ...DAILY_GOAL_PRESETS.filter((preset) => preset.kind === kind).map((preset) => preset.target),
      ...(goal.kind === kind ? [goal.target] : []),
    ]),
  ].sort((a, b) => a - b);
  const target = amounts[kind];

  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!saving) onSave({ kind, target });
      }}
    >
      <fieldset disabled={saving}>
        <legend className="sr-only">{t('editor.type')}</legend>
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
          {types.map(({ kind: value, icon: Icon }) => (
            <Button
              key={value}
              type="button"
              variant="ghost"
              aria-pressed={kind === value}
              data-testid={`daily-goal-kind-${value}`}
              className="h-auto min-h-11 min-w-0 px-1.5 py-1 whitespace-normal"
              onClick={() => setKind(value)}
            >
              <Icon aria-hidden />
              {t(`editor.kind.${value}`)}
            </Button>
          ))}
        </div>
      </fieldset>
      <GoalWheel
        key={kind}
        kind={kind}
        target={target}
        targets={targets}
        disabled={saving}
        onChange={(next) => setAmounts((current) => ({ ...current, [kind]: next }))}
      />
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-2">
        <Button
          type="button"
          variant="ghost"
          disabled={saving}
          onClick={onCancel}
          data-testid="daily-goal-cancel"
        >
          {common('cancel')}
        </Button>
        <Button type="submit" disabled={saving} data-testid="daily-goal-save">
          {saving ? common('saving') : t('editor.save')}
        </Button>
      </div>
    </form>
  );
}

function GoalWheel({
  kind,
  target,
  targets,
  disabled,
  onChange,
}: {
  kind: DailyGoalKind;
  target: number;
  targets: number[];
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const t = useTranslations('dailyGoal');
  const format = useFormatter();
  const wheel = useRef<HTMLDivElement>(null);
  const id = useId();
  const [initialIndex] = useState(() => targets.indexOf(target));

  useLayoutEffect(() => {
    const node = wheel.current;
    if (node) node.scrollTop = (initialIndex * node.clientHeight) / 3;
  }, [initialIndex]);

  function choose(index: number) {
    const node = wheel.current;
    if (node) node.scrollTop = (index * node.clientHeight) / 3;
    onChange(targets[index]);
  }

  return (
    <div className="relative mx-auto max-w-64">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/3 h-1/3 rounded-lg bg-muted"
      />
      <div
        ref={wheel}
        role="listbox"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label={t(`editor.target.${kind}`)}
        aria-activedescendant={`${id}-${target}`}
        className="relative h-[calc(var(--goal-wheel-row)*3)] snap-y snap-mandatory overflow-y-auto overscroll-contain py-[var(--goal-wheel-row)] [--goal-wheel-row:max(44px,2.75rem)] [scrollbar-width:none] focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-scrollbar]:hidden"
        onKeyDown={(event) => {
          if (disabled) return;
          const index = targets.indexOf(target);
          const next = {
            ArrowUp: Math.max(0, index - 1),
            ArrowDown: Math.min(targets.length - 1, index + 1),
            Home: 0,
            End: targets.length - 1,
          }[event.key];
          if (next === undefined) return;
          event.preventDefault();
          choose(next);
        }}
        onScroll={(event) => {
          if (disabled) return;
          const node = event.currentTarget;
          const next =
            targets[
              Math.min(
                targets.length - 1,
                Math.max(0, Math.round(node.scrollTop / (node.clientHeight / 3))),
              )
            ];
          if (next !== target) onChange(next);
        }}
      >
        {targets.map((value, index) => (
          <button
            key={value}
            id={`${id}-${value}`}
            type="button"
            role="option"
            tabIndex={-1}
            disabled={disabled}
            aria-selected={value === target}
            aria-label={t(`preset.${kind}`, { count: value })}
            data-testid={`daily-goal-target-${value}`}
            className={`flex h-[var(--goal-wheel-row)] w-full cursor-pointer snap-center items-center justify-center gap-2 rounded-lg tabular-nums focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${value === target ? 'text-xl font-bold text-foreground' : 'text-base text-muted-foreground'}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(index)}
          >
            {format.number(value)}
            <span className="text-xs font-normal text-muted-foreground">
              {t(`editor.unit.${kind}`)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
