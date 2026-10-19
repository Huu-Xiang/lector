'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-base';
import { planName } from '@/lib/plan-names';
import { useRetryCountdown } from '@/lib/use-retry-countdown';

const ERRORS = new Set([
  'invalid_code',
  'expired',
  'used_up',
  'already_redeemed',
  'higher_plan_active',
  'subscription_active',
  'email_not_verified',
  'too_many_attempts',
]);

/** "Have a code?" box in the plan card. */
export default function RedeemCode({ onRedeemed }: { onRedeemed: () => void }) {
  const t = useTranslations('settings.redeem');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const wait = useRetryCountdown();

  async function redeem() {
    setBusy(true);
    try {
      const res = await apiFetch('/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.error === 'too_many_attempts' && body.retryAfterSeconds) {
          wait.block(body.retryAfterSeconds);
        }
        const message = t(`errors.${ERRORS.has(body.error) ? body.error : 'generic'}`, {
          minutes: Math.ceil((body.retryAfterSeconds ?? 3600) / 60),
        });
        toast.error(
          body.error === 'invalid_code' && body.attemptsLeft <= 3
            ? `${message} ${t('attemptsLeft', { count: body.attemptsLeft })}`
            : message,
        );
        return;
      }
      toast.success(
        t('success', {
          plan: planName(body.plan),
          date: new Date(body.endsAt).toLocaleDateString(locale),
        }),
      );
      setCode('');
      setOpen(false);
      onRedeemed();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="text-sm font-medium text-primary hover:underline"
        onClick={() => setOpen(true)}
        data-testid="redeem-open"
      >
        {t('open')}
      </button>
    );
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) void redeem();
      }}
    >
      <input
        className="w-48 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={t('placeholder')}
        aria-label={t('placeholder')}
        autoFocus
        maxLength={64}
        data-testid="redeem-input"
      />
      <Button
        type="submit"
        size="sm"
        disabled={busy || !code.trim() || wait.secondsLeft > 0}
        data-testid="redeem-submit"
      >
        {busy ? t('redeeming') : t('submit')}
      </Button>
      {wait.secondsLeft > 0 && (
        <p className="w-full text-xs text-destructive" role="status" data-testid="redeem-locked">
          {t('errors.too_many_attempts', { minutes: wait.minutesLeft })}
        </p>
      )}
    </form>
  );
}
