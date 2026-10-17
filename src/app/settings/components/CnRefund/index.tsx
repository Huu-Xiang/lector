'use client';

import { useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { fetchRefundStatus, submitRefundRequest, type RefundStatus } from '@/lib/cn-billing';
import { planName } from '@/lib/plan-names';

/** Refund request for an RMB order, shown only while the 24-hour window is open. */
export default function CnRefund() {
  const t = useTranslations('refund');
  const format = useFormatter();
  const [status, setStatus] = useState<RefundStatus | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchRefundStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status?.order) return null;
  if (status.block === 'already_refunded' || status.block === 'no_order') return null;

  async function submit() {
    setBusy(true);
    const next = await submitRefundRequest();
    setBusy(false);
    setConfirming(false);
    if (!next) {
      toast.error(t('failed'));
      return;
    }
    setStatus(next);
    if (next.block === 'pending') toast.success(t('submitted'));
    else toast.error(t('notAllowed'));
  }

  const order = status.order;
  const deadline = format.dateTime(new Date(order.deadline), {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <section className="panel p-6" data-testid="cn-refund">
      <h2 className="mb-1 text-lg font-semibold text-foreground">{t('title')}</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        {t('rules', { plan: planName(order.plan), deadline })}
      </p>
      {status.block === 'pending' && (
        <p className="text-sm font-medium text-foreground" data-testid="cn-refund-pending">
          {t('pending')}
        </p>
      )}
      {status.block === 'used_too_much' && (
        <p className="text-sm text-muted-foreground" data-testid="cn-refund-used">
          {t('usedTooMuch', { percent: status.usedPercent })}
        </p>
      )}
      {status.eligible && !confirming && (
        <Button variant="outline" onClick={() => setConfirming(true)} data-testid="cn-refund-open">
          {t('request')}
        </Button>
      )}
      {status.eligible && confirming && (
        <div className="space-y-2" data-testid="cn-refund-confirm">
          <p className="text-sm text-foreground">{t('confirm')}</p>
          <div className="flex gap-2">
            <Button onClick={submit} disabled={busy} data-testid="cn-refund-submit">
              {t('submit')}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
