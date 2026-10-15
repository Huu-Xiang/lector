'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import Link from 'next/link';
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
import { planName } from '@/lib/plan-names';
import {
  fetchCnOptions,
  fetchCnOrderStatus,
  forgetCnOrder,
  formatFen,
  rememberCnOrder,
  startCnCheckout,
  takeRememberedCnOrder,
  type CnChannel,
  type CnMonths,
  type CnPrice,
} from '@/lib/cn-billing';
import { getEntitlements, type ClientEntitlements } from '@/lib/data-layer';
import {
  PAID_TIERS,
  TIER_ALLOWANCES,
  chinaPrice,
  fetchPlanPrices,
  findPrice,
  formatMoney,
  type PaidTier,
  type PlanPrice,
} from '@/lib/plan-prices';

/**
 * The Free upgrade / paid-only recovery screen (#224): pick a plan → the API creates a Paddle
 * transaction → redirect to /checkout, where the overlay opens on
 * Paddle's approved domain → Paddle bounces
 * back here with ?checkout=success → poll /api/billing/status until the webhook
 * marks the subscription active → into the app. Also the #216 lapse contract's
 * other half: a Free or locked account can always export its data or sign out here.
 *
 * Lives in the (auth) route group for the chrome-free shell and the selfhost
 * bounce, but unlike its siblings it REQUIRES a session (AuthGuard treats it
 * as a normal route) — checkout needs to know who it's activating.
 */

type Phase = 'loading' | 'pick' | 'activating' | 'slow' | 'unavailable' | 'suspended';

export default function SubscribePage() {
  const t = useTranslations('subscribe');
  const tp = useTranslations('plans');
  const locale = useLocale();
  const [prices, setPrices] = useState<PlanPrice[] | null>(null);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [opening, setOpening] = useState<string | null>(null);
  const [requestedPlan, setRequestedPlan] = useState<PaidPlan | null>(null);
  // A campaign code word from the marketing link (#516). Only the API knows
  // whether it maps to a discount, so this is what we offer Paddle, not a
  // promise about the price.
  const [promo, setPromo] = useState<string | null>(null);
  const [rejectedPromo, setRejectedPromo] = useState<string | null>(null);
  const [cnPrices, setCnPrices] = useState<CnPrice[] | null>(null);
  const [paddleReady, setPaddleReady] = useState(false);
  const [method, setMethod] = useState<'cn' | 'card'>('card');
  const [channel, setChannel] = useState<CnChannel>('alipay');
  const [entitlements, setEntitlements] = useState<ClientEntitlements | null>(null);
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

  // The RMB cashier sends the buyer back to this page; the order number was
  // kept before leaving. The server also asks the platform when polled.
  const pollCnOrder = useCallback(
    (outTradeNo: string) => {
      function tick(attempt: number) {
        pollTimer.current = setTimeout(async () => {
          const state = await fetchCnOrderStatus(outTradeNo);
          if (state === 'SUCCEEDED') {
            forgetCnOrder();
            window.location.replace('/');
            return;
          }
          if (state === 'CLOSED' || state === 'FAILED' || state === null || attempt >= 45) {
            forgetCnOrder();
            if (state !== 'PAYING' && state !== 'CREATED') toast.error(t('cnNotPaid'));
            setPhase('pick');
            return;
          }
          tick(attempt + 1);
        }, 2000);
      }
      tick(0);
    },
    [t],
  );

  useEffect(() => () => clearTimeout(pollTimer.current ?? undefined), []);

  useEffect(() => {
    fetchPlanPrices().then(setPrices);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const requested = paidPlanFromSearch(window.location.search);
    const requestedPromo = promoFromSearch(window.location.search);

    Promise.all([fetchBillingStatus(), fetchCnOptions(), getEntitlements()]).then(
      ([s, cn, ent]) => {
        if (cancelled) return;
        setCnPrices(cn);
        setEntitlements(ent);

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

        const pendingCn = takeRememberedCnOrder();
        if (pendingCn && cn) {
          setPhase('activating');
          pollCnOrder(pendingCn);
          return;
        }

        // Returning from the /checkout overlay (Paddle's successUrl bounces
        // here): the webhook may not have landed yet, so show activation and
        // poll rather than the tiles the user just used.
        if (new URLSearchParams(window.location.search).get('checkout') === 'success') {
          setPhase('activating');
          pollUntilActive();
          return;
        }

        // Nothing to sell, or nowhere approved to check out → graceful fallback
        // (dev and the e2e billing server run without prices / CHECKOUT_URL).
        const paddle = s.checkout.prices.length > 0 && checkoutUrl() !== '';
        if (!paddle && !cn) {
          setPhase('unavailable');
          return;
        }
        setPaddleReady(paddle);
        setMethod(
          cn && (!paddle || document.documentElement.lang.startsWith('zh')) ? 'cn' : 'card',
        );

        setPhase('pick');
      },
    );

    return () => {
      cancelled = true;
    };
  }, [pollUntilActive, pollCnOrder]);

  async function openCnCheckout(plan: PaidTier, months: CnMonths) {
    if (opening !== null) return;
    setOpening(`cn-${plan}-${months}`);
    const started = await startCnCheckout(plan, months, channel);
    if ('error' in started) {
      setOpening(null);
      toast.error(
        started.error === 'higher_plan_active'
          ? t('cnHigherPlan')
          : started.error === 'subscription_active'
            ? t('cnSubscriptionActive')
            : t('checkoutFailed'),
      );
      return;
    }
    rememberCnOrder(started.outTradeNo);
    window.location.assign(started.payUrl);
  }

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
    // Hard navigate to the /checkout page; Paddle opens the
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
  const paidTiers: PaidTier[] = requestedPlan
    ? [...PAID_TIERS].sort((a, b) => Number(b === requestedPlan) - Number(a === requestedPlan))
    : [...PAID_TIERS];
  const shownPrice = (plan: PaidTier, cycle: 'month' | 'year') => {
    const money = findPrice(prices, plan, cycle)?.unitPrice;
    return money ? formatMoney(money, locale) : null;
  };
  const free = TIER_ALLOWANCES.free;
  const freeFeatures = [
    tp('features.glosses', { count: free.glosses }),
    tp('features.detailed', { count: free.detailed }),
    tp('features.freeLibrary'),
    tp('features.byok'),
    t('freeFeatures.export'),
  ];

  return (
    <div className="space-y-4" data-testid="subscribe-panel">
      {showFree && (
        <Link
          href="/"
          className="text-sm text-primary hover:underline"
          data-testid="subscribe-back"
        >
          ← {t('back')}
        </Link>
      )}
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

      {entitlements?.grant && phase === 'pick' && (
        <p
          className="rounded-lg border border-primary/40 bg-[var(--primary-soft)] p-3 text-sm text-foreground"
          data-testid="subscribe-grant"
        >
          {t('grantActive', {
            plan: planName(entitlements.grant.plan),
            date: new Date(entitlements.grant.endsAt).toLocaleDateString(locale),
          })}
        </p>
      )}

      {phase === 'pick' && cnPrices && (
        <div className="space-y-2" data-testid="subscribe-methods">
          {paddleReady && (
            <div className="flex flex-wrap gap-2">
              {(['cn', 'card'] as const).map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant={method === m ? 'default' : 'outline'}
                  onClick={() => setMethod(m)}
                  data-testid={`subscribe-method-${m}`}
                >
                  {m === 'cn' ? t('methodCn') : t('methodCard')}
                </Button>
              ))}
            </div>
          )}
          {method === 'cn' && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {(['alipay', 'wechat'] as const).map((c) => (
                <Button
                  key={c}
                  type="button"
                  size="sm"
                  variant={channel === c ? 'default' : 'outline'}
                  onClick={() => setChannel(c)}
                  data-testid={`subscribe-channel-${c}`}
                >
                  {c === 'alipay' ? t('channelAlipay') : t('channelWechat')}
                </Button>
              ))}
              <span className="text-xs text-muted-foreground">{t('cnNote')}</span>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {showFree && phase !== 'loading' && phase !== 'activating' && phase !== 'slow' && (
          <div
            className="rounded-xl border border-border bg-card p-4"
            data-testid="subscribe-tier-free"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-foreground">{t('freeName')}</span>
              {(!entitlements || entitlements.plan === 'free') && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {t('currentPlan')}
                </span>
              )}
            </div>
            <p className="mt-1">
              <span className="text-2xl font-bold text-foreground">$0</span>
              <span className="text-sm text-muted-foreground"> {t('forever')}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t('freeTagline')}</p>
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              {freeFeatures.map((feature) => (
                <li key={feature} className="flex gap-2">
                  <span aria-hidden="true" className="text-primary">
                    ✓
                  </span>
                  {feature}
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
          paidTiers.map((plan) => {
            const monthly = status.checkout.prices.find(
              (p) => p.plan === plan && p.cycle === 'month',
            );
            const annual = status.checkout.prices.find(
              (p) => p.plan === plan && p.cycle === 'year',
            );
            const cnMonth = cnPrices?.find((p) => p.plan === plan && p.months === 1);
            const cnYear = cnPrices?.find((p) => p.plan === plan && p.months === 12);
            if (method === 'card' && !monthly && !annual) return null;
            if (method === 'cn' && (!cnMonth || !cnYear)) return null;
            const requested = plan === requestedPlan;
            const monthlyPrice = shownPrice(plan, 'month');
            const annualPrice = shownPrice(plan, 'year');
            const cn = chinaPrice(findPrice(prices, plan, 'month'));
            const allowance = TIER_ALLOWANCES[plan];
            const features = [
              tp('features.glosses', { count: allowance.glosses }),
              tp('features.detailed', { count: allowance.detailed }),
              'phraseWords' in allowance
                ? tp('features.phraseWords', { count: allowance.phraseWords })
                : tp('features.phraseUnlimited'),
              plan === 'cloud' ? tp('features.moreRoom') : tp('features.unlimitedLibrary'),
            ];
            // Annual is the default action when both cycles exist.
            const primary = annual ?? monthly;
            const secondary = primary?.cycle === 'year' ? monthly : annual;
            const cycleCopy = (cycle: 'month' | 'year', price: string | null, lead: boolean) =>
              cycle === 'year'
                ? price
                  ? lead
                    ? requested
                      ? t('checkoutYear', { price })
                      : t('subscribeYear', { price })
                    : t('orYear', { price })
                  : lead
                    ? t('subscribeYearNoPrice')
                    : t('orYearNoPrice')
                : price
                  ? lead
                    ? requested
                      ? t('checkoutMonth', { price })
                      : t('subscribeMonth', { price })
                    : t('orMonth', { price })
                  : lead
                    ? t('subscribeMonthNoPrice')
                    : t('orMonthNoPrice');
            const priceFor = (cycle: 'month' | 'year') =>
              cycle === 'year' ? annualPrice : monthlyPrice;
            return (
              <div
                key={plan}
                className={`flex flex-col rounded-xl border p-4 ${
                  plan === 'plus' || requested ? 'border-primary' : 'border-border'
                }`}
                data-testid={`subscribe-tier-${plan}`}
                data-requested={requested || undefined}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">{planName(plan)}</span>
                  {requested && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                      {t('selected')}
                    </span>
                  )}
                </div>
                {method === 'cn' && cnMonth && cnYear && (
                  <>
                    <p className="mt-1">
                      <span className="text-2xl font-bold text-foreground">
                        {formatFen(cnMonth.amountFen, locale)}
                      </span>
                      <span className="text-sm text-muted-foreground">{t('perMonth')}</span>
                    </p>
                    <p className="mt-1 text-xs font-medium text-primary">
                      {t('cnYearNote', { price: formatFen(cnYear.amountFen, locale) })}
                    </p>
                  </>
                )}
                {method === 'card' && monthlyPrice && (
                  <p className="mt-1">
                    <span className="text-2xl font-bold text-foreground">{monthlyPrice}</span>
                    <span className="text-sm text-muted-foreground">{t('perMonth')}</span>
                  </p>
                )}
                {method === 'card' && annual && annualPrice && (
                  <p className="mt-1 text-xs font-medium text-primary">
                    {t('annualNote', { price: annualPrice })}
                  </p>
                )}
                {method === 'card' && cn && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {tp('chinaPrice', { price: formatMoney(cn, locale) })}
                  </p>
                )}
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <span aria-hidden="true" className="text-primary">
                        ✓
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>
                {method === 'cn' && cnMonth && cnYear ? (
                  <>
                    <Button
                      type="button"
                      className="mt-auto w-full cursor-pointer"
                      disabled={opening !== null}
                      onClick={() => openCnCheckout(plan, 12)}
                      data-testid={`subscribe-cn-${plan}-12`}
                    >
                      {opening === `cn-${plan}-12`
                        ? t('openingCheckout')
                        : t('cnBuyYear', { price: formatFen(cnYear.amountFen, locale) })}
                    </Button>
                    <button
                      type="button"
                      className="mt-2 w-full cursor-pointer text-center text-xs font-medium text-primary hover:underline disabled:cursor-default disabled:opacity-70"
                      disabled={opening !== null}
                      onClick={() => openCnCheckout(plan, 1)}
                      data-testid={`subscribe-cn-${plan}-1`}
                    >
                      {opening === `cn-${plan}-1`
                        ? t('openingCheckout')
                        : t('cnBuyMonth', { price: formatFen(cnMonth.amountFen, locale) })}
                    </button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      className="mt-4 w-full cursor-pointer"
                      disabled={opening !== null}
                      onClick={() => openCheckout(primary!)}
                      data-testid={`subscribe-price-${primary!.plan}-${primary!.cycle}`}
                    >
                      {opening === primary!.id ? (
                        <>
                          <Spinner
                            tone="current"
                            label={t('openingCheckoutLabel')}
                            data-testid="subscribe-price-opening"
                          />
                          {t('openingCheckout')}
                        </>
                      ) : (
                        cycleCopy(primary!.cycle, priceFor(primary!.cycle), true)
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
                        {opening === secondary.id
                          ? t('openingCheckout')
                          : cycleCopy(secondary.cycle, priceFor(secondary.cycle), false)}
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
      </div>

      {/* A locked account still needs a way out: its data, and sign-out. */}
      {!showFree && (
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
      )}
    </div>
  );
}
