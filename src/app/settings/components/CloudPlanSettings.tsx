'use client';

import { useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  applyPlanChange,
  createCustomerPortalSession,
  fetchBillingStatus,
  previewPlanChange,
  type BillingMoney,
  type BillingPrice,
  type BillingStatus,
  type PlanChangePreview,
} from '@/lib/billing';
import {
  getEntitlements,
  invalidateEntitlementsCache,
  type ClientEntitlements,
} from '@/lib/data-layer';

type Translator = ReturnType<typeof useTranslations>;

function formatMoney(money: BillingMoney | null, locale: string): string | null {
  if (!money) return null;
  const amount = Number(money.amount);
  if (!Number.isFinite(amount)) return null;
  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: money.currencyCode,
    });
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(amount / 10 ** digits);
  } catch {
    return `${money.amount} ${money.currencyCode}`;
  }
}

function billingError(error: string, t: Translator): string {
  if (error === 'subscription_past_due') return t('errors.pastDue');
  if (error === 'subscription_ambiguous') return t('errors.ambiguous');
  if (error === 'plan_already_current') return t('errors.alreadyCurrent');
  return t('errors.generic');
}

export default function CloudPlanSettings() {
  const t = useTranslations('settings.plan');
  const locale = useLocale();
  const format = useFormatter();
  const planLabel = (plan: ClientEntitlements['plan']) => t(`labels.${plan}`);
  const cycleLabel = (cycle: BillingPrice['cycle']) => t(`cycle.${cycle}`);
  const priceLabel = (price: BillingPrice) =>
    t('priceLabel', { plan: planLabel(price.plan), cycle: cycleLabel(price.cycle) });
  const limitLabel = (value: number | null | undefined, fallback: string) => {
    if (value === null) return t('unlimited');
    if (typeof value === 'number') return format.number(value);
    return fallback;
  };
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [entitlements, setEntitlements] = useState<ClientEntitlements | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [selectedPriceId, setSelectedPriceId] = useState('');
  const [preview, setPreview] = useState<PlanChangePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<BillingPrice | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchBillingStatus(), getEntitlements()]).then(
      ([nextBilling, nextEntitlements]) => {
        if (cancelled) return;
        setBilling(nextBilling);
        setEntitlements(nextEntitlements);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const currentSubscription = billing?.management?.subscription ?? null;
  const changes = (billing?.checkout.prices ?? [])
    .filter(
      (price) =>
        !currentSubscription ||
        price.plan !== currentSubscription.plan ||
        price.cycle !== currentSubscription.cycle,
    )
    .sort((a, b) => {
      if (currentSubscription) {
        const aSamePlan = a.plan === currentSubscription.plan ? 0 : 1;
        const bSamePlan = b.plan === currentSubscription.plan ? 0 : 1;
        if (aSamePlan !== bSamePlan) return aSamePlan - bSamePlan;
      }
      if (a.cycle !== b.cycle) return a.cycle === 'year' ? -1 : 1;
      return a.plan.localeCompare(b.plan);
    });
  // Deliberately NOT pre-selected: the first option is whatever the sort ranks
  // highest (the same-plan annual upsell), and a <select> showing it reads as a
  // statement of the current plan rather than an offer. A monthly member saw
  // "Cloud Plus — annual" here and reported their plan had changed. The
  // placeholder keeps the control silent until the member picks a plan.
  const effectiveSelectedPriceId = changes.some((price) => price.id === selectedPriceId)
    ? selectedPriceId
    : '';
  const activePreview =
    preview && changes.some((price) => price.id === preview.target.id) ? preview : null;

  useEffect(() => {
    if (!pendingTarget) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async (attempt: number) => {
      const nextBilling = await fetchBillingStatus();
      if (cancelled) return;
      if (nextBilling) setBilling(nextBilling);
      const next = nextBilling?.management?.subscription;
      if (next?.plan === pendingTarget.plan && next.cycle === pendingTarget.cycle) {
        invalidateEntitlementsCache();
        const nextEntitlements = await getEntitlements();
        if (cancelled) return;
        if (nextEntitlements) setEntitlements(nextEntitlements);
        setPendingTarget(null);
        toast.success(t('toast.updated'));
        return;
      }
      if (attempt < 30) timer = setTimeout(() => void poll(attempt + 1), 2_000);
    };

    timer = setTimeout(() => void poll(1), 2_000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pendingTarget]);

  async function openPortal() {
    if (openingPortal) return;
    setOpeningPortal(true);
    const result = await createCustomerPortalSession();
    if (!result.ok) {
      setOpeningPortal(false);
      toast.error(billingError(result.error, t));
      return;
    }
    window.location.assign(result.value.url);
  }

  async function reviewChange() {
    if (!effectiveSelectedPriceId || previewing) return;
    setPreviewing(true);
    const result = await previewPlanChange(effectiveSelectedPriceId);
    setPreviewing(false);
    if (!result.ok) {
      toast.error(billingError(result.error, t));
      return;
    }
    setPreview(result.value);
  }

  async function confirmChange() {
    if (!activePreview || applying) return;
    setApplying(true);
    const result = await applyPlanChange(activePreview.target.id);
    setApplying(false);
    if (!result.ok) {
      toast.error(billingError(result.error, t));
      return;
    }
    setPreview(null);
    setPendingTarget(result.value.target);
    toast.success(t('toast.accepted'));
  }

  const plan = entitlements?.plan;
  const lapsed =
    plan === 'free' && billing !== null && !billing.subscriptionActive && billing.status !== 'none';

  return (
    <section id="plan" className="panel p-6" data-testid="cloud-plan-settings">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('heading')}</h2>
          <p className="mt-1 text-sm text-muted-foreground" data-testid="cloud-plan-current">
            {plan
              ? currentSubscription && currentSubscription.plan === plan
                ? t('currentWithCycle', {
                    plan: planLabel(plan),
                    cycle: cycleLabel(currentSubscription.cycle),
                  })
                : t('current', { plan: planLabel(plan) })
              : t('loading')}
          </p>
        </div>
        {plan && (
          <div className="flex flex-wrap justify-end gap-2">
            <span className="rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-semibold text-primary">
              {planLabel(plan)}
            </span>
            {entitlements.byok && (
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                {t('ownKey')}
              </span>
            )}
          </div>
        )}
      </div>

      {entitlements && plan === 'free' && (
        <div className="mt-4 space-y-3 text-sm text-muted-foreground">
          {lapsed && (
            <p className="rounded-lg border border-border bg-[var(--primary-soft)] p-3 text-foreground">
              {t('lapsed')}
            </p>
          )}
          <p>{t('freeIntro')}</p>
          <p className="text-xs">
            {t('libraryAllowance', {
              collections: limitLabel(entitlements.limits.maxCollections, '10'),
              lessons: limitLabel(entitlements.limits.maxLessons, '200'),
              words: limitLabel(entitlements.limits.journalWordsPerMonth, '1,000'),
            })}
          </p>
          <p className="text-xs">{t('fairUse')}</p>
          {entitlements.byok ? (
            <p className="text-xs">{t('byokActive')}</p>
          ) : (
            <p className="text-xs">
              {t('managedAllowance', {
                glosses: limitLabel(entitlements.limits.wordGlossesPerMonth, '1,000'),
                phrases: limitLabel(entitlements.limits.phraseTranslationsPerDay, '10'),
                context: limitLabel(entitlements.limits.contextTranslationsPerDay, '10'),
              })}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button type="button" onClick={() => (window.location.href = '/subscribe')}>
              {t('comparePlans')}
            </Button>
            <a href="#byok" className="text-sm font-medium text-primary hover:underline">
              {t('bringKey')}
            </a>
            {billing?.management?.customerPortal && (
              <Button type="button" variant="ghost" onClick={openPortal} disabled={openingPortal}>
                {openingPortal ? t('openingPaddle') : t('billingHistory')}
              </Button>
            )}
          </div>
        </div>
      )}

      {plan && plan !== 'free' && (
        <div className="mt-4 space-y-4 text-sm text-muted-foreground">
          <p>{t('paidIntro')}</p>

          {pendingTarget && (
            <p className="rounded-lg border border-border bg-[var(--primary-soft)] p-3 text-foreground">
              {t('pendingAccepted', { price: priceLabel(pendingTarget) })}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {billing?.management?.customerPortal && (
              <Button type="button" onClick={openPortal} disabled={openingPortal}>
                {openingPortal ? t('openingPaddle') : t('manageBilling')}
              </Button>
            )}
            <span className="text-xs">{t('paddleHandles')}</span>
          </div>

          {currentSubscription?.canChange && changes.length > 0 && !pendingTarget && (
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div>
                <h3 className="font-medium text-foreground">{t('changePlan')}</h3>
                {/* One expression, not interleaved text and braces: JSX drops the
                    space between an expression and the text that follows it on the
                    next line, which rendered "monthlybilling". */}
                <p className="mt-1 text-xs" data-testid="billing-change-intro">
                  {t('changeIntro', {
                    plan: planLabel(currentSubscription.plan),
                    cycle: cycleLabel(currentSubscription.cycle),
                  })}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  value={effectiveSelectedPriceId}
                  onChange={(event) => {
                    setSelectedPriceId(event.target.value);
                    setPreview(null);
                  }}
                  className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                  data-testid="billing-change-price"
                  aria-label={t('choosePlanAria')}
                >
                  <option value="">{t('choosePlanOption')}</option>
                  {changes.map((price) => (
                    <option key={price.id} value={price.id}>
                      {priceLabel(price)}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={reviewChange}
                  disabled={!effectiveSelectedPriceId || previewing}
                  data-testid="billing-change-review"
                >
                  {previewing ? t('calculating') : t('reviewChange')}
                </Button>
              </div>

              {activePreview && (
                <div
                  className="space-y-3 rounded-md bg-muted/40 p-3"
                  data-testid="billing-change-preview"
                >
                  <p className="font-medium text-foreground">
                    {t('changeTo', { price: priceLabel(activePreview.target) })}
                  </p>
                  <p className="text-xs">
                    {activePreview.prorationBillingMode === 'prorated_immediately'
                      ? t('prorationImmediate')
                      : t('prorationNextInvoice')}
                  </p>
                  <dl className="grid gap-1 text-xs sm:grid-cols-2">
                    <dt>{t('dueNow')}</dt>
                    <dd className="font-medium text-foreground sm:text-right">
                      {formatMoney(activePreview.immediateCharge, locale) ?? t('noImmediateCharge')}
                    </dd>
                    <dt>{t('nextInvoice')}</dt>
                    <dd className="font-medium text-foreground sm:text-right">
                      {formatMoney(activePreview.nextCharge, locale) ?? t('calculatedAtRenewal')}
                    </dd>
                    <dt>{t('regularRenewal')}</dt>
                    <dd className="font-medium text-foreground sm:text-right">
                      {formatMoney(activePreview.recurringCharge, locale) ?? t('unavailable')}
                    </dd>
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={confirmChange}
                      disabled={applying}
                      data-testid="billing-change-confirm"
                    >
                      {applying ? t('applying') : t('confirmPaddle')}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setPreview(null)}>
                      {t('cancel')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {currentSubscription && !currentSubscription.canChange && (
            <p className="text-xs">{t('changesUnavailable')}</p>
          )}
        </div>
      )}
    </section>
  );
}
