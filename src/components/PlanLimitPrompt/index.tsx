'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  NAMED_METRICS,
  PLAN_LIMIT_EVENT,
  planLimitAction,
  planLimitWantsDialog,
  type PlanLimitPayload,
} from '@/lib/plan-limits';
import { TIER_ALLOWANCES } from '@/lib/plan-prices';

const DIALOG_SEEN_KEY = 'readfox-plan-limit-dialog';

/** Once per metric per day, so a reader who keeps tapping is not stopped every time. */
function dialogSeenToday(metric: string): boolean {
  const key = `${metric}:${new Date().toISOString().slice(0, 10)}`;
  try {
    const seen = JSON.parse(localStorage.getItem(DIALOG_SEEN_KEY) ?? '[]') as string[];
    if (seen.includes(key)) return true;
    localStorage.setItem(DIALOG_SEEN_KEY, JSON.stringify([...seen.slice(-20), key]));
  } catch {
    // Private mode: show the dialog every time.
  }
  return false;
}

export default function PlanLimitPrompt() {
  const t = useTranslations('planLimits');
  const [dialog, setDialog] = useState<PlanLimitPayload | null>(null);

  useEffect(() => {
    const text = (payload: PlanLimitPayload) => {
      const named = NAMED_METRICS.has(payload.metric);
      const values = { limit: payload.limit, used: payload.used };
      const upgrade = payload.upgrade ? t(`upgradeLine.${payload.upgrade}`) : '';
      return {
        title: named ? t(`metrics.${payload.metric}.title`) : t('generic.title'),
        body: `${named ? t(`metrics.${payload.metric}.body`, values) : t('generic.body')} ${upgrade}`.trim(),
      };
    };

    const onLimit = (event: Event) => {
      const payload = (event as CustomEvent<PlanLimitPayload>).detail;
      if (planLimitWantsDialog(payload) && !dialogSeenToday(payload.metric)) {
        setDialog(payload);
        return;
      }
      const { title, body } = text(payload);
      const action = planLimitAction(payload.upgrade, payload.metric);
      toast.warning(title, {
        description: body,
        action: action
          ? {
              label: t(action.label),
              onClick: () => {
                window.location.href = action.href;
              },
            }
          : undefined,
        duration: 8000,
      });
    };
    window.addEventListener(PLAN_LIMIT_EVENT, onLimit);
    return () => window.removeEventListener(PLAN_LIMIT_EVENT, onLimit);
  }, [t]);

  const plus = TIER_ALLOWANCES.cloud;
  return (
    <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
      <DialogContent className="max-w-md space-y-3 p-6" data-testid="plan-limit-dialog">
        {dialog && (
          <>
            <DialogTitle>{t(`metrics.${dialog.metric}.title`)}</DialogTitle>
            <DialogDescription>
              {t(`metrics.${dialog.metric}.body`, { limit: dialog.limit, used: dialog.used })}
            </DialogDescription>
            <p className="text-sm text-foreground">
              {t('dialog.plus', { glosses: plus.glosses, detailed: plus.detailed })}
            </p>
            <p className="text-sm text-muted-foreground">{t('dialog.freeReset')}</p>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <DialogClose className={buttonVariants({ variant: 'outline' })}>
                {t('notNow')}
              </DialogClose>
              <Link
                href="/subscribe?plan=cloud"
                className={buttonVariants()}
                onClick={() => setDialog(null)}
                data-testid="plan-limit-upgrade"
              >
                {t('upgradePlus')}
              </Link>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
