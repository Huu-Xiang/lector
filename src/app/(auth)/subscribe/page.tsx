'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { apiUrl, checkoutUrl } from '@/lib/api-base';
import { authClient } from '@/lib/auth-client';
import { paidPlanFromSearch, promoFromSearch, type PaidPlan } from '@/lib/auth-return';
import {
  fetchBillingStatus,
  startCheckout,
  type BillingPrice,
  type BillingStatus,
} from '@/lib/billing';

/**
 * The Free upgrade / paid-only recovery screen (#224): pick a plan → the API creates a Paddle
 * transaction → redirect to lector.dev/checkout, where the overlay opens on
 * Paddle's approved domain (app.lector.dev is not approved) → Paddle bounces
 * back here with ?checkout=success → poll /api/billing/status until the webhook
 * marks the subscription active → into the app. Also the #216 lapse contract's
 * other half: a Free or locked account can always export its data or sign out here.
 *
 * Lives in the (auth) route group for the chrome-free shell and the selfhost
 * bounce, but unlike its siblings it REQUIRES a session (AuthGuard treats it
 * as a normal route) — checkout needs to know who it's activating.
 */

/**
 * Plan copy mirrored from lector-site's /pricing tiers (its `tiers` array) —
 * static on purpose: what the tier costs must render even when Paddle is
 * unreachable, and the two surfaces should read identically. If the site
 * copy changes, change this with it. The Paddle `pri_…` ids stay env-config
 * (PADDLE_PRICE_*, api/src/lib/billing.ts) — a tier renders its buy buttons
 * only for the cycles that have one configured.
 */
const TIERS: Array<{
  plan: BillingPrice['plan'];
  name: string;
  monthlyPrice: string;
  annualPrice: string;
  badge?: 'beta';
  features: string[];
  featured: boolean;
}> = [
  {
    plan: 'cloud',
    name: 'Cloud',
    monthlyPrice: '$5',
    annualPrice: '$50',
    badge: 'beta',
    features: ['managed', 'allowance', 'voices', 'room', 'backups', 'email'],
    featured: true,
  },
  {
    plan: 'plus',
    name: 'Cloud Plus',
    monthlyPrice: '$12',
    annualPrice: '$120',
    features: ['everything', 'largerAllowance', 'priority', 'earlyAccess'],
    featured: false,
  },
];

const FREE_FEATURES = [
  'read',
  'vocab',
  'limits',
  'lookups',
  'glosses',
  'phrases',
  'context',
  'voices',
  'byok',
  'export',
];

type Phase = 'loading' | 'pick' | 'activating' | 'slow' | 'unavailable' | 'suspended';

export default function SubscribePage() {
  const t = useTranslations('subscribe');
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [opening, setOpening] = useState<string | null>(null);
  const [requestedPlan, setRequestedPlan] = useState<PaidPlan | null>(null);
  // A campaign code word from the marketing link (#516). Only the API knows
  // whether it maps to a discount, so this is what we offer Paddle, not a
  // promise about the price.
  const [promo, setPromo] = useState<string | null>(null);
  const [rejectedPromo, setRejectedPromo] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // One-shot activation poll: the webhook usually lands within seconds of
  // checkout completing; give it 90 before suggesting patience.
  const pollUntilActive = useCallback(() => {
    function tick(attempt: number) {
      pollTimer.current = setTimeout(async () => {
        const s = await fetchBillingStatus();
        if (s?.subscriptionActive) {
          // Hard navigation on purpose — every guard and cache re-evaluates.
          window.location.replace('/');
          return;
        }
        if (attempt >= 45) {
          setPhase('slow');
          return;
        }
        tick(attempt + 1);
      }, 2000);
    }
    tick(0);
  }, []);

  useEffect(() => () => clearTimeout(pollTimer.current ?? undefined), []);

  useEffect(() => {
    let cancelled = false;
    const requested = paidPlanFromSearch(window.location.search);
    const requestedPromo = promoFromSearch(window.location.search);

    fetchBillingStatus().then((s) => {
      if (cancelled) return;

      setRequestedPlan(requested);
      setPromo(requestedPromo);

      // Billing off, already paid/exempt, or status unreachable → this page
      // has no business rendering; the rest of the app knows better than us.
      // Free access alone is not a reason to redirect: /subscribe doubles as
      // its opt-in upgrade surface.
      if (s === null || !s.enforced) {
        window.location.replace('/');
        return;
      }

      setStatus(s);

      // Suspension is an abuse/security lock, not a billing state. It wins
      // over Free and paid activation so the page cannot offer a misleading
      // "Continue" loop while the API is correctly denying app access.
      if (s.suspended) {
        setPhase('suspended');
        return;
      }

      if (s.subscriptionActive || s.exempt) {
        window.location.replace('/');
        return;
      }

      // Returning from the lector.dev overlay (Paddle's successUrl bounces
      // here): the webhook may not have landed yet, so show activation and
      // poll rather than the tiles the user just used.
      if (new URLSearchParams(window.location.search).get('checkout') === 'success') {
        setPhase('activating');
        pollUntilActive();
        return;
      }

      // Nothing to sell, or nowhere approved to check out → graceful fallback
      // (dev and the e2e billing server run without prices / CHECKOUT_URL).
      if (s.checkout.prices.length === 0 || checkoutUrl() === '') {
        setPhase('unavailable');
        return;
      }

      setPhase('pick');
    });

    return () => {
      cancelled = true;
    };
  }, [pollUntilActive]);

  async function openCheckout(price: BillingPrice) {
    if (opening !== null) return;
    setOpening(price.id);
    setRejectedPromo(null);
    const started = await startCheckout(price.id, promo);
    if (started === null) {
      setOpening(null);
      toast.error(t('checkoutFailed'));
      return;
    }
    // A code the API could not map must stop here. Redirecting anyway would
    // send the reader to an overlay showing a different number than the one
    // they expected, which is the one outcome this feature must not produce.
    // The plan stays available: the next click sends no code and proceeds at
    // full price.
    if (started.discount === 'unknown') {
      setOpening(null);
      setRejectedPromo(promo);
      setPromo(null);
      return;
    }
    // Hard navigate to the approved-domain checkout page; Paddle opens the
    // overlay for this transaction there and bounces back to ?checkout=success.
    // Pass the current theme so the overlay matches the app; the tenant rides
    // the transaction (custom_data), never the URL.
    const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    window.location.assign(
      `${checkoutUrl()}?_ptxn=${encodeURIComponent(started.txnId)}&theme=${theme}`,
    );
  }

  async function signOut() {
    await authClient.signOut();
    window.location.replace('/login');
  }

  const lapsed = status !== null && status.status !== 'none';
  const showFree = status?.freeTierEnabled === true && !status.suspended;
  const paidTiers = requestedPlan
    ? [...TIERS].sort((a, b) => Number(b.plan === requestedPlan) - Number(a.plan === requestedPlan))
    : TIERS;

  return (
    <div className="space-y-4" data-testid="subscribe-panel">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          {status?.suspended
            ? t('title.suspended')
            : lapsed
              ? showFree
                ? t('title.lapsedFree')
                : t('title.lapsed')
              : showFree
                ? t('title.free')
                : t('title.paid')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {status?.suspended
            ? t('body.suspended')
            : lapsed
              ? showFree
                ? t('body.lapsedFree')
                : t('body.lapsed')
              : showFree
                ? t('body.free')
                : t('body.paid')}
        </p>
      </div>

      {phase === 'loading' && (
        <div className="flex justify-center py-8">
          <Spinner size="lg" label={t('loadingPlans')} className="text-primary" />
        </div>
      )}

      {phase === 'unavailable' && (
        <p className="rounded-lg border border-border bg-[var(--primary-soft)] p-3 text-sm text-foreground">
          {t('unavailable')}
        </p>
      )}

      {phase === 'suspended' && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
          {t('suspendedHelp')}
        </p>
      )}

      {phase === 'pick' && promo !== null && (
        <p
          className="rounded-lg border border-primary/40 bg-[var(--primary-soft)] p-3 text-sm text-foreground"
          data-testid="subscribe-promo"
          data-promo={promo}
        >
          {t.rich('promoReady', {
            promo,
            strong: (chunks) => <span className="font-semibold">{chunks}</span>,
          })}
        </p>
      )}

      {phase === 'pick' && rejectedPromo !== null && (
        <p
          className="rounded-lg border border-border bg-muted p-3 text-sm text-foreground"
          data-testid="subscribe-promo-unknown"
        >
          {t.rich('promoUnknown', {
            promo: rejectedPromo,
            strong: (chunks) => <span className="font-semibold">{chunks}</span>,
          })}
        </p>
      )}

      {(phase === 'activating' || phase === 'slow') && (
        <div
          className="rounded-lg border border-border bg-[var(--primary-soft)] p-3 text-sm text-foreground"
          data-testid="subscribe-activating"
        >
          {phase === 'activating' ? <p>{t('activating')}</p> : <p>{t('slow')}</p>}
        </div>
      )}

      {showFree && phase !== 'loading' && phase !== 'activating' && phase !== 'slow' && (
        <div
          className="rounded-xl border border-border bg-card p-4"
          data-testid="subscribe-tier-free"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-foreground">{t('freeName')}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {t('currentPlan')}
            </span>
          </div>
          <p className="mt-1">
            <span className="text-2xl font-bold text-foreground">$0</span>
            <span className="text-sm text-muted-foreground"> {t('forever')}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t('freeTagline')}</p>
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {FREE_FEATURES.map((feature) => (
              <li key={feature} className="flex gap-2">
                <span aria-hidden="true" className="text-primary">
                  ✓
                </span>
                {t(`freeFeatures.${feature}`)}
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            className="mt-4 w-full cursor-pointer"
            onClick={() => window.location.replace('/')}
            data-testid="subscribe-continue-free"
          >
            {t('continueFree')}
          </Button>
        </div>
      )}

      {phase === 'pick' &&
        status !== null &&
        paidTiers.map((tier) => {
          const monthly = status.checkout.prices.find(
            (p) => p.plan === tier.plan && p.cycle === 'month',
          );
          const annual = status.checkout.prices.find(
            (p) => p.plan === tier.plan && p.cycle === 'year',
          );
          if (!monthly && !annual) return null;
          const requested = tier.plan === requestedPlan;
          // Annual is the recommended/default action when both cycles exist:
          // pay for ten months and get twelve. An explicit marketing plan
          // intent still selects/sorts the requested tier; it does not make
          // monthly billing the hidden default inside that tier.
          const primary = annual ?? monthly!;
          const secondary = primary.cycle === 'year' ? monthly : annual;
          const primaryCopy =
            primary.cycle === 'year'
              ? requested
                ? t('checkoutYear', { price: tier.annualPrice })
                : t('subscribeYear', { price: tier.annualPrice })
              : requested
                ? t('checkoutMonth', { price: tier.monthlyPrice })
                : t('subscribeMonth', { price: tier.monthlyPrice });
          const secondaryCopy =
            secondary?.cycle === 'month'
              ? t('orMonth', { price: tier.monthlyPrice })
              : t('orYear', { price: tier.annualPrice });
          return (
            <div
              key={tier.plan}
              className={`rounded-xl border p-4 ${
                tier.featured || requested ? 'border-primary' : 'border-border'
              }`}
              data-testid={`subscribe-tier-${tier.plan}`}
              data-requested={requested || undefined}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground">{tier.name}</span>
                <span className="flex items-center gap-1.5">
                  {requested && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                      {t('selected')}
                    </span>
                  )}
                  {tier.badge && (
                    <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-xs font-medium text-primary">
                      {t(`badges.${tier.badge}`)}
                    </span>
                  )}
                </span>
              </div>
              <p className="mt-1">
                <span className="text-2xl font-bold text-foreground">{tier.monthlyPrice}</span>
                <span className="text-sm text-muted-foreground">{t('perMonth')}</span>
              </p>
              {annual && (
                <p className="mt-1 text-xs font-medium text-primary">
                  {t('annualNote', { price: tier.annualPrice })}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {t(`tiers.${tier.plan}.tagline`)}
              </p>
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span aria-hidden="true" className="text-primary">
                      ✓
                    </span>
                    {t(`tiers.${tier.plan}.features.${feature}`)}
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                className="mt-4 w-full cursor-pointer"
                disabled={opening !== null}
                onClick={() => openCheckout(primary)}
                data-testid={`subscribe-price-${primary.plan}-${primary.cycle}`}
              >
                {opening === primary.id ? (
                  <>
                    <Spinner
                      tone="current"
                      label={t('openingCheckoutLabel')}
                      data-testid="subscribe-price-opening"
                    />
                    {t('openingCheckout')}
                  </>
                ) : (
                  primaryCopy
                )}
              </Button>
              {secondary && (
                <button
                  type="button"
                  className="mt-2 w-full cursor-pointer text-center text-xs font-medium text-primary hover:underline disabled:cursor-default disabled:opacity-70"
                  disabled={opening !== null}
                  onClick={() => openCheckout(secondary)}
                  data-testid={`subscribe-price-${secondary.plan}-${secondary.cycle}`}
                >
                  {opening === secondary.id ? t('openingCheckout') : secondaryCopy}
                </button>
              )}
            </div>
          );
        })}

      <div className="flex items-center justify-between border-t border-border pt-4 text-sm">
        <a
          href={apiUrl('/api/data')}
          className="text-primary hover:underline"
          data-testid="subscribe-export"
        >
          {t('exportData')}
        </a>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={signOut}
          data-testid="subscribe-signout"
        >
          {t('signOut')}
        </Button>
      </div>
    </div>
  );
}
