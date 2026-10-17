import { apiFetch } from './api-base';
import type { PaidTier } from './plan-prices';

export type CnChannel = 'alipay' | 'wechat';
export type CnMonths = 1 | 12;

export interface CnPrice {
  plan: PaidTier;
  months: CnMonths;
  /** Fen: 1/100 RMB. */
  amountFen: number;
}

const PENDING_KEY = 'readfox-cn-order';

export async function fetchCnOptions(): Promise<CnPrice[] | null> {
  try {
    const res = await apiFetch('/api/billing/cn/options');
    if (!res.ok) return null;
    const body = (await res.json()) as { enabled: boolean; prices: CnPrice[] };
    return body.enabled ? body.prices : null;
  } catch {
    return null;
  }
}

export async function startCnCheckout(
  plan: PaidTier,
  months: CnMonths,
  channel: CnChannel,
): Promise<{ outTradeNo: string; payUrl: string } | { error: string }> {
  try {
    const res = await apiFetch('/api/billing/cn/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, months, channel }),
    });
    const body = await res.json();
    return res.ok ? body : { error: body.error ?? 'cn_checkout_failed' };
  } catch {
    return { error: 'cn_checkout_failed' };
  }
}

export interface CnOrderState {
  status: string;
  plan: PaidTier;
  months: CnMonths;
}

export async function fetchCnOrderStatus(outTradeNo: string): Promise<CnOrderState | null> {
  try {
    const res = await apiFetch(`/api/billing/cn/orders/${encodeURIComponent(outTradeNo)}`);
    if (!res.ok) return null;
    return (await res.json()) as CnOrderState;
  } catch {
    return null;
  }
}

export interface PendingCnOrder {
  outTradeNo: string;
  /** Absent for an order remembered before the cashier link was kept. */
  payUrl?: string;
}

export function rememberCnOrder(order: PendingCnOrder): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(order));
  } catch {
    // Private mode: the buyer returns to a normal page and the plan still activates.
  }
}

export function takeRememberedCnOrder(): PendingCnOrder | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingCnOrder;
    if (typeof parsed?.outTradeNo === 'string') return parsed;
  } catch {
    // An older build stored the bare order number.
  }
  return { outTradeNo: raw };
}

export function forgetCnOrder(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // nothing to forget
  }
}

export function formatFen(fen: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: fen % 100 === 0 ? 0 : 2,
  }).format(fen / 100);
}

export interface RefundStatus {
  order: { outTradeNo: string; plan: string; paidAt: string; deadline: string } | null;
  eligible: boolean;
  block: 'no_order' | 'already_refunded' | 'pending' | 'used_too_much' | null;
  usedPercent: number;
  requestStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
}

export async function fetchRefundStatus(): Promise<RefundStatus | null> {
  try {
    const res = await apiFetch('/api/billing/cn/refund');
    return res.ok ? ((await res.json()) as RefundStatus) : null;
  } catch {
    return null;
  }
}

export async function submitRefundRequest(): Promise<RefundStatus | null> {
  try {
    const res = await apiFetch('/api/billing/cn/refund', { method: 'POST' });
    return res.ok ? ((await res.json()) as RefundStatus) : null;
  } catch {
    return null;
  }
}
