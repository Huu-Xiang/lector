'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { getEntitlements } from '@/lib/data-layer';
import { planName } from '@/lib/plan-names';
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

type Tier = 'free' | PaidTier;

export default function PricingTiers() {
  const t = useTranslations('plans');
  const locale = useLocale();
  const [prices, setPrices] = useState<PlanPrice[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    fetchPlanPrices().then(setPrices);
    // Signed out on this public page: no plan to highlight.
    getEntitlements().then((ent) => setCurrent(ent?.plan ?? null));
  }, []);

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
      const monthly = findPrice(prices, plan, 'month');
      const annual = findPrice(prices, plan, 'year');
      const allowance = TIER_ALLOWANCES[plan];
      const cn = chinaPrice(monthly);
      return {
        tier: plan as Tier,
        price: monthly?.unitPrice
          ? t('perMonth', { price: formatMoney(monthly.unitPrice, locale) })
          : t('priceAtCheckout'),
        secondary: [
          annual?.unitPrice ? t('perYear', { price: formatMoney(annual.unitPrice, locale) }) : null,
          cn ? t('chinaPrice', { price: formatMoney(cn, locale) }) : null,
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
            {!isCurrent && (
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
  );
}
