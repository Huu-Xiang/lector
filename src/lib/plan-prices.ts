import { apiFetch } from './api-base';
import type { BillingPrice } from './billing';

export interface Money {
  /** Lowest denomination, e.g. cents. */
  amount: string;
  currencyCode: string;
}

export interface PlanPrice extends BillingPrice {
  unitPrice: Money | null;
  overrides: Array<{ countryCodes: string[]; unitPrice: Money }>;
}

export type PaidTier = BillingPrice['plan'];

/** Display order of the paid tiers. */
export const PAID_TIERS: readonly PaidTier[] = ['cloud', 'plus', 'max'];

/**
 * Monthly allowances shown on the pricing surfaces. Mirrors DEFAULT_PLAN_LIMITS
 * in api/src/lib/entitlements.ts; change both together.
 */
export const TIER_ALLOWANCES = {
  free: { glosses: 1000, detailed: 50, phraseWords: 30 },
  cloud: { glosses: 5000, detailed: 300, phraseWords: 30 },
  plus: { glosses: 10000, detailed: 800, phraseWords: 30 },
  max: { glosses: 30000, detailed: 2000 },
} as const;

export async function fetchPlanPrices(): Promise<PlanPrice[] | null> {
  try {
    const res = await apiFetch('/api/billing/prices');
    if (!res.ok) return null;
    const body = (await res.json()) as { prices?: PlanPrice[] };
    return Array.isArray(body.prices) ? body.prices : null;
  } catch {
    return null;
  }
}

export function formatMoney(money: Money, locale: string): string {
  const value = Number(money.amount) / 100;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currencyCode,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function findPrice(
  prices: readonly PlanPrice[] | null,
  plan: PaidTier,
  cycle: BillingPrice['cycle'],
): PlanPrice | undefined {
  return prices?.find((p) => p.plan === plan && p.cycle === cycle);
}

/** The price a buyer in mainland China pays, when Paddle has an override for it. */
export function chinaPrice(price: PlanPrice | undefined): Money | null {
  return price?.overrides.find((o) => o.countryCodes.includes('CN'))?.unitPrice ?? null;
}
