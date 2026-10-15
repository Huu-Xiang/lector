'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { planName } from '@/lib/plan-names';
import {
  PAID_TIERS,
  TIER_ALLOWANCES,
  chinaPrice,
  fetchPlanPrices,
  findPrice,
  formatMoney,
  type PlanPrice,
} from '@/lib/plan-prices';

export default function PricingTiers() {
  const t = useTranslations('plans');
  const locale = useLocale();
  const [prices, setPrices] = useState<PlanPrice[] | null>(null);

  useEffect(() => {
    fetchPlanPrices().then(setPrices);
  }, []);

  const free = TIER_ALLOWANCES.free;
  return (
    <div className="grid gap-3 sm:grid-cols-2" data-testid="pricing-tiers">
      <TierCard
        name={planName('free')}
        price={t('freePrice')}
        features={[
          t('features.glosses', { count: free.glosses }),
          t('features.detailed', { count: free.detailed }),
          t('features.freeLibrary'),
          t('features.byok'),
        ]}
      />
      {PAID_TIERS.map((plan) => {
        const monthly = findPrice(prices, plan, 'month');
        const annual = findPrice(prices, plan, 'year');
        const allowance = TIER_ALLOWANCES[plan];
        const cn = chinaPrice(monthly);
        return (
          <TierCard
            key={plan}
            name={planName(plan)}
            price={
              monthly?.unitPrice
                ? t('perMonth', { price: formatMoney(monthly.unitPrice, locale) })
                : t('priceAtCheckout')
            }
            secondary={[
              annual?.unitPrice
                ? t('perYear', { price: formatMoney(annual.unitPrice, locale) })
                : null,
              cn ? t('chinaPrice', { price: formatMoney(cn, locale) }) : null,
            ]}
            features={[
              t('features.glosses', { count: allowance.glosses }),
              t('features.detailed', { count: allowance.detailed }),
              'phraseWords' in allowance
                ? t('features.phraseWords', { count: allowance.phraseWords })
                : t('features.phraseUnlimited'),
              plan === 'cloud' ? t('features.moreRoom') : t('features.unlimitedLibrary'),
            ]}
          />
        );
      })}
      <div className="sm:col-span-2">
        <Link
          href="/register"
          className="inline-block rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground hover:opacity-90"
        >
          {t('getStarted')}
        </Link>
      </div>
    </div>
  );
}

function TierCard({
  name,
  price,
  secondary = [],
  features,
}: {
  name: string;
  price: string;
  secondary?: Array<string | null>;
  features: string[];
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="font-semibold">{name}</p>
      <p className="mt-1 text-xl font-bold">{price}</p>
      {secondary
        .filter((line): line is string => line !== null)
        .map((line) => (
          <p key={line} className="text-xs text-muted-foreground">
            {line}
          </p>
        ))}
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
    </div>
  );
}
