import type { Database } from 'bun:sqlite';
import { db } from '../db';
import { recordProductEvent } from './product-analytics';
import type { ProductEvent } from './product-events';

const CURRENCIES = new Set(
  'USD EUR GBP JPY CAD AUD CHF HKD SGD SEK NOK DKK PLN MXN BRL CNY CZK HUF ILS INR KRW NZD ZAR ARS COP UAH CLP PEN THB TRY TWD VND'.split(
    ' ',
  ),
);

type BillingEvent = Pick<ProductEvent, 'event' | 'outcome' | 'step' | 'value'>;

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function paddleId(value: unknown, prefix: string): string | undefined {
  return typeof value === 'string' && value.startsWith(prefix) && /^[a-z0-9_]{5,64}$/.test(value)
    ? value
    : undefined;
}

function money(amount: unknown, currency: unknown): Pick<ProductEvent, 'value' | 'step'> {
  if (typeof amount !== 'string' || !/^\d{1,13}$/.test(amount)) return {};
  const value = Number(amount);
  if (value > 1e12 || typeof currency !== 'string' || !CURRENCIES.has(currency)) return {};
  return { value, step: currency };
}

function owningAccount(
  database: Database,
  data: Record<string, unknown>,
  subscriptionId?: string,
): string | undefined {
  const attributed = object(data.custom_data)?.lectorUserId;
  const customerId = paddleId(data.customer_id, 'ctm_');
  const owner = subscriptionId
    ? database
        .query<
          { userId: string | null },
          [string, string | null]
        >('SELECT userId FROM billing_subscriptions WHERE paddleSubscriptionId = ? AND paddleCustomerId = ?')
        .get(subscriptionId, customerId ?? null)
    : undefined;
  const userId = owner?.userId ?? (typeof attributed === 'string' ? attributed : undefined);
  if (userId) {
    return database.query('SELECT 1 FROM user WHERE id = ?').get(userId) ? userId : undefined;
  }
  if (!customerId) return;
  const matches = database
    .query<{ id: string; emailVerified: number }, [string]>(
      `SELECT u.id, u.emailVerified FROM billing_customers c
       JOIN user u ON lower(u.email) = c.email WHERE c.paddleCustomerId = ? LIMIT 2`,
    )
    .all(customerId);
  if (matches.length === 1 && matches[0].emailVerified === 1) return matches[0].id;
}

function capturedAmount(data: Record<string, unknown>): number | undefined {
  if (!Array.isArray(data.payments)) return;
  let total = 0;
  for (const raw of data.payments) {
    const payment = object(raw);
    if (payment?.status !== 'captured') continue;
    if (typeof payment.amount !== 'string' || !/^\d{1,13}$/.test(payment.amount)) return;
    total += Number(payment.amount);
    if (total > 1e12) return;
  }
  return total;
}

/** Projects only business facts from the authenticated Paddle webhook. */
export function recordPaddleAnalytics(raw: unknown, database?: Database): void {
  const webhook = object(raw);
  if (!webhook) return;
  const data = object(webhook.data);
  const occurredAt = webhook.occurred_at;
  if (!data || typeof occurredAt !== 'string') return;
  const now = new Date(occurredAt);
  if (!Number.isFinite(now.valueOf())) return;
  const subscription = paddleId(data.subscription_id, 'sub_');
  let event: BillingEvent;
  let id: string | undefined;
  switch (webhook.event_type) {
    case 'transaction.completed': {
      id = paddleId(data.id, 'txn_');
      const amount = capturedAmount(data);
      if (!amount || data.status !== 'completed') return;
      event = { event: 'payment_succeeded', ...money(String(amount), data.currency_code) };
      break;
    }
    case 'transaction.payment_failed':
      id = paddleId(data.id, 'txn_');
      event = { event: 'payment_failed', outcome: 'declined' };
      break;
    case 'transaction.canceled':
      if (data.status !== 'canceled') return;
      id = paddleId(data.id, 'txn_');
      event = { event: 'payment_canceled', outcome: 'transaction' };
      break;
    case 'subscription.canceled':
      if (data.status !== 'canceled') return;
      id = paddleId(data.id, 'sub_');
      event = { event: 'payment_canceled', outcome: 'subscription' };
      break;
    case 'adjustment.created':
    case 'adjustment.updated': {
      const action = data.action;
      if (data.status !== 'approved' || (action !== 'refund' && action !== 'chargeback')) return;
      id = paddleId(data.id, 'adj_');
      event = {
        event: 'payment_refunded',
        outcome: action,
        ...money(object(data.totals)?.total, data.currency_code),
      };
      break;
    }
    default:
      return;
  }
  if (!id) return;
  const userId = owningAccount(
    database ?? db,
    data,
    subscription ?? (event.outcome === 'subscription' ? id : undefined),
  );
  if (!userId) return;
  recordProductEvent({ ...event, feature: 'paddle' }, { userId, key: id, now, database });
}
