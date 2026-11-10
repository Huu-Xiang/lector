'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { authClient } from '@/lib/auth-client';
import { getEntitlements } from '@/lib/data-layer';
import { useLectorMode } from '@/lib/use-env';
import { planName } from '@/lib/plan-names';
import {
  PAID_TIERS,
  TIER_ALLOWANCES,
  annualSavingPercent,
  chinaPrice,
  fetchPlanPrices,
  findPrice,
  formatMoney,
  monthlyEquivalent,
  type PaidTier,
  type PlanPrice,
} from '@/lib/plan-prices';

type Tier = 'free' | PaidTier;
type Cycle = 'year' | 'month';

/** Cloud only: reads the plan after a session exists, so a signed-out visitor sends no 401 call. */
function CloudPlanProbe({ onPlan }: { onPlan: (plan: string | null) => void }) {
  const { data: session } = authClient.useSession();
  const userId = session?.user.id;
  useEffect(() => {
    if (userId) getEntitlements().then((ent) => onPlan(ent?.plan ?? null));
  }, [userId, onPlan]);
  return null;
}

/** `initialPrices` comes from the server render, so the amounts are in the HTML. */
export default function PricingTiers({ initialPrices }: { initialPrices: PlanPrice[] | null }) {
  const t = useTranslations('plans');
  const locale = useLocale();
  const [prices, setPrices] = useState<PlanPrice[] | null>(initialPrices);
  const [current, setCurrent] = useState<string | null>(null);
  const [cycle, setCycle] = useState<Cycle>('year');

  useEffect(() => {
    if (!initialPrices) fetchPlanPrices().then(setPrices);
  }, [initialPrices]);

  const mode = useLectorMode();
  useEffect(() => {
    if (mode === 'selfhost') getEntitlements().then((ent) => setCurrent(ent?.plan ?? null));
  }, [mode]);

  const bestSaving = Math.max(
    0,
    ...PAID_TIERS.map(
      (plan) =>
        annualSavingPercent(
          findPrice(prices, plan, 'month')?.unitPrice,
          findPrice(prices, plan, 'year')?.unitPrice,
        ) ?? 0,
    ),
  );

  const signedIn = current !== null;
  const free = TIER_ALLOWANCES.free;
  const tiers: Array<{
    tier: Tier;
    price: string;
    secondary: Array<string | null>;
    features: string[];
  }> = [
    {
      tier: 'free',
      price: t('freePrice'),
      secondary: [],
      features: [
        t('features.glosses', { count: free.glosses }),
        t('features.detailed', { count: free.detailed }),
        t('features.freeLibrary'),
      ],
    },
    ...PAID_TIERS.map((plan) => {
      const monthly = findPrice(prices, plan, 'month')?.unitPrice;
      const annual = findPrice(prices, plan, 'year')?.unitPrice;
      const allowance = TIER_ALLOWANCES[plan];
      const showAnnual = cycle === 'year' && annual;
      const saving = annualSavingPercent(monthly, annual);
      const cnMonth = chinaPrice(findPrice(prices, plan, 'month'));
      const cnYear = chinaPrice(findPrice(prices, plan, 'year'));
      let price = t('priceAtCheckout');
      if (showAnnual) price = t('perYearMain', { price: formatMoney(annual, locale) });
      else if (monthly) price = t('perMonth', { price: formatMoney(monthly, locale) });
      return {
        tier: plan as Tier,
        price,
        secondary: showAnnual
          ? [
              saving
                ? t('annualEquivalentSave', {
                    price: formatMoney(monthlyEquivalent(annual), locale),
                    percent: saving,
                  })
                : t('annualEquivalent', { price: formatMoney(monthlyEquivalent(annual), locale) }),
              cnYear ? t('chinaPriceYear', { price: formatMoney(cnYear, locale) }) : null,
            ]
          : [
              annual ? t('perYear', { price: formatMoney(annual, locale) }) : null,
              cnMonth ? t('chinaPrice', { price: formatMoney(cnMonth, locale) }) : null,
            ],
        features: [
          t('features.glosses', { count: allowance.glosses }),
          t('features.detailed', { count: allowance.detailed }),
          'phraseWords' in allowance
            ? t('features.phraseWords', { count: allowance.phraseWords })
            : t('features.phraseUnlimited'),
          plan === 'cloud' ? t('features.moreRoom') : t('features.unlimitedLibrary'),
          t('features.byokPaid'),
        ],
      };
    }),
  ];

  return (
    <div className="space-y-4">
      {mode === 'cloud' && <CloudPlanProbe onPlan={setCurrent} />}
      <div
        role="group"
        aria-label={t('cycleLabel')}
        className="mx-auto flex w-fit rounded-lg border border-border bg-card p-0.5"
      >
        {(['year', 'month'] as const).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={cycle === id}
            onClick={() => setCycle(id)}
            data-testid={`pricing-cycle-${id}`}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
              cycle === id
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {id === 'year'
              ? bestSaving > 0
                ? t('cycleYearSave', { percent: bestSaving })
                : t('cycleYear')
              : t('cycleMonth')}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="pricing-tiers">
        {tiers.map(({ tier, price, secondary, features }) => {
          const isCurrent = current === tier;
          const href =
            tier === 'free'
              ? signedIn
                ? '/'
                : '/register'
              : signedIn
                ? `/subscribe?plan=${tier}`
                : `/register?next=${encodeURIComponent(`/subscribe?plan=${tier}`)}`;
          return (
            <div
              key={tier}
              className={`flex flex-col rounded-xl border bg-card p-4 ${
                isCurrent ? 'border-primary ring-2 ring-primary/30' : 'border-border'
              }`}
              data-testid={`pricing-tier-${tier}`}
              data-current={isCurrent || undefined}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{planName(tier)}</p>
                {isCurrent && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                    {t('current')}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xl font-bold">{price}</p>
              {secondary
                .filter((line): line is string => line !== null)
                .map((line) => (
                  <p key={line} className="text-xs text-muted-foreground">
                    {line}
                  </p>
                ))}
              <ul className="mt-3 mb-4 space-y-1 text-xs text-muted-foreground">
                {features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span aria-hidden="true" className="text-primary">
                      ✓
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>
              {!isCurrent && !(tier === 'free' && signedIn) && (
                <Link
                  href={href}
                  className={`mt-auto rounded-lg px-3 py-2 text-center text-sm font-semibold ${
                    tier === 'free'
                      ? 'border border-border text-foreground hover:bg-muted'
                      : 'bg-primary text-primary-foreground hover:opacity-90'
                  }`}
                  data-testid={`pricing-choose-${tier}`}
                >
                  {tier === 'free' ? t('getStarted') : t('choose', { plan: planName(tier) })}
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
