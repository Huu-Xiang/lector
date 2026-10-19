'use client';

import { useCallback, useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-base';
import { invalidateEntitlementsCache } from '@/lib/data-layer';
import { planName } from '@/lib/plan-names';
import { useRetryCountdown } from '@/lib/use-retry-countdown';

interface InviteState {
  code: string;
  rewardDays: number;
  maxRewards: number;
  invited: number;
  rewarded: number;
  invitedBy: { status: string } | null;
  canClaim: boolean;
  cards: Array<{ id: string; days: number; expiresAt: string }>;
}

async function readError(res: Response): Promise<{ error?: string; [key: string]: unknown }> {
  return (await res.json().catch(() => ({}))) as { error?: string };
}

/** Invite link, the card inventory, and the late "enter a code" box. */
export default function InviteCard() {
  const t = useTranslations('settings.invite');
  const format = useFormatter();
  const locale = useLocale();
  const [state, setState] = useState<InviteState | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const wait = useRetryCountdown();

  const load = useCallback(async () => {
    const res = await apiFetch('/api/invite');
    if (res.ok) setState((await res.json()) as InviteState);
  }, []);

  useEffect(() => {
    void load().catch(() => {});
  }, [load]);

  if (!state) return null;

  const link = `${window.location.origin}/register?invite=${state.code}`;
  const errorText = (body: {
    error?: string;
    retryAfterSeconds?: unknown;
    attemptsLeft?: unknown;
  }) => {
    const key = body.error && body.error in ERROR_KEYS ? body.error : 'generic';
    const message = t(`errors.${key}`, {
      minutes: Math.ceil((Number(body.retryAfterSeconds) || 3600) / 60),
    });
    return body.error === 'invalid_code' && Number(body.attemptsLeft) <= 3
      ? `${message} ${t('attemptsLeft', { count: Number(body.attemptsLeft) })}`
      : message;
  };

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t('copied'));
    } catch {
      toast.error(link);
    }
  }

  async function claim() {
    setBusy('claim');
    try {
      const res = await apiFetch('/api/invite/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const body = await readError(res);
        if (body.error === 'too_many_attempts') wait.block(Number(body.retryAfterSeconds) || 3600);
        toast.error(errorText(body));
        return;
      }
      setState((await res.json()) as InviteState);
      setCode('');
      toast.success(t('claimed'));
    } finally {
      setBusy(null);
    }
  }

  async function activate(id: string) {
    setBusy(id);
    try {
      const res = await apiFetch(`/api/invite/cards/${id}/activate`, { method: 'POST' });
      const body = await readError(res);
      if (!res.ok) {
        toast.error(errorText(body));
        return;
      }
      toast.success(
        t('activated', {
          plan: planName(String(body.plan)),
          date: new Date(String(body.endsAt)).toLocaleDateString(locale),
        }),
      );
      invalidateEntitlementsCache();
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      className="mt-6 rounded-2xl border border-border bg-card p-5"
      data-testid="invite-card"
    >
      <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('intro', { days: state.rewardDays, max: state.maxRewards })}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={link}
          aria-label={t('linkLabel')}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground"
          data-testid="invite-link"
        />
        <Button type="button" size="sm" variant="secondary" onClick={copy}>
          {t('copy')}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground" data-testid="invite-stats">
        {t('stats', { invited: state.invited, rewarded: state.rewarded })}
      </p>

      {state.invitedBy && (
        <p className="mt-3 text-sm text-muted-foreground">
          {state.invitedBy.status === 'pending' ? t('joinedPending') : t('joinedDone')}
        </p>
      )}

      <h3 className="mt-5 text-sm font-semibold text-foreground">
        {t('cardsTitle')} ({state.cards.length})
      </h3>
      {state.cards.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">{t('cardsEmpty')}</p>
      ) : (
        <ul className="mt-2 space-y-2" data-testid="invite-cards">
          {state.cards.map((card) => (
            <li
              key={card.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {t('card', { days: card.days })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('cardUntil', {
                    date: format.dateTime(new Date(card.expiresAt), { dateStyle: 'medium' }),
                  })}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={busy !== null}
                onClick={() => void activate(card.id)}
                data-testid="invite-card-activate"
              >
                {busy === card.id ? t('activating') : t('activate')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {state.canClaim && !state.invitedBy && (
        <form
          className="mt-5 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) void claim();
          }}
        >
          <label className="w-full text-sm text-muted-foreground" htmlFor="invite-claim-input">
            {t('haveCode')}
          </label>
          <input
            id="invite-claim-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t('codePlaceholder')}
            maxLength={64}
            className="w-48 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground"
            data-testid="invite-claim-input"
          />
          <Button
            type="submit"
            size="sm"
            disabled={busy !== null || !code.trim() || wait.secondsLeft > 0}
            data-testid="invite-claim-submit"
          >
            {t('codeSubmit')}
          </Button>
          {wait.secondsLeft > 0 && (
            <p
              className="w-full text-xs text-destructive"
              role="status"
              data-testid="invite-locked"
            >
              {t('errors.too_many_attempts', { minutes: wait.minutesLeft })}
            </p>
          )}
        </form>
      )}
    </section>
  );
}

const ERROR_KEYS: Record<string, true> = {
  invalid_code: true,
  self_invite: true,
  already_attached: true,
  window_closed: true,
  used_up: true,
  email_used: true,
  too_many_attempts: true,
  not_found: true,
  already_used: true,
  expired: true,
  higher_plan_active: true,
  subscription_active: true,
};
