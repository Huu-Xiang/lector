import { randomUUID } from 'crypto';
import { db } from '../db';
import type { EntitlementsEngine } from './entitlements';
import { endGrantByRef } from './plan-grants';

/** A paid RMB order can be refunded within this window. */
export const REFUND_WINDOW_MS = 24 * 3_600_000;
/** Most of the plan's AI allowance that may be used since payment. */
export const REFUND_MAX_USED = 0.1;

export type RefundBlock = 'no_order' | 'already_refunded' | 'pending' | 'used_too_much';

export interface RefundStatus {
  order: { outTradeNo: string; plan: string; paidAt: string; deadline: string } | null;
  eligible: boolean;
  block: RefundBlock | null;
  usedPercent: number;
  requestStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
}

interface OrderRow {
  outTradeNo: string;
  plan: string;
  paidAt: string;
  baselinePeriod: string | null;
  baselineLlm: number;
  baselineGloss: number;
}

/** Remember this month's AI use at payment, so earlier use on Free does not count against a refund. */
export function recordRefundBaseline(
  outTradeNo: string,
  userId: string,
  engine: EntitlementsEngine,
): void {
  const periods = engine.currentPeriods();
  db.prepare(
    'UPDATE cn_orders SET baselinePeriod = ?, baselineLlm = ?, baselineGloss = ? WHERE outTradeNo = ?',
  ).run(
    periods.month,
    engine.getUsage(userId, 'llmRequestsPerMonth', periods),
    engine.getUsage(userId, 'wordGlossesPerMonth', periods),
    outTradeNo,
  );
}

function usedSince(
  userId: string,
  order: OrderRow,
  engine: EntitlementsEngine,
): { percent: number } {
  const periods = engine.currentPeriods();
  const sameMonth = order.baselinePeriod === periods.month;
  const { limits } = engine.resolveEntitlements(userId);
  const ratio = (metric: 'llmRequestsPerMonth' | 'wordGlossesPerMonth', baseline: number) => {
    const used = Math.max(0, engine.getUsage(userId, metric, periods) - (sameMonth ? baseline : 0));
    const limit = limits[metric];
    if (limit === null) return 0;
    return limit > 0 ? used / limit : used > 0 ? 1 : 0;
  };
  const worst = Math.max(
    ratio('llmRequestsPerMonth', order.baselineLlm),
    ratio('wordGlossesPerMonth', order.baselineGloss),
  );
  return { percent: Math.round(worst * 100) };
}

export function refundStatus(
  userId: string,
  engine: EntitlementsEngine,
  now: Date = new Date(),
): RefundStatus {
  const none: RefundStatus = {
    order: null,
    eligible: false,
    block: 'no_order',
    usedPercent: 0,
    requestStatus: null,
  };
  const refunded = db
    .prepare("SELECT 1 FROM cn_refund_requests WHERE userId = ? AND status = 'APPROVED'")
    .get(userId);
  const order = db
    .prepare(
      `SELECT outTradeNo, plan, paidAt, baselinePeriod, baselineLlm, baselineGloss
       FROM cn_orders WHERE userId = ? AND status IN ('SUCCEEDED', 'REFUNDED') AND paidAt IS NOT NULL
       ORDER BY paidAt DESC LIMIT 1`,
    )
    .get(userId) as OrderRow | undefined;
  if (!order) return none;

  const deadline = new Date(new Date(order.paidAt).getTime() + REFUND_WINDOW_MS);
  const request = db
    .prepare('SELECT status FROM cn_refund_requests WHERE outTradeNo = ?')
    .get(order.outTradeNo) as { status: RefundStatus['requestStatus'] } | undefined;
  const base = {
    order: {
      outTradeNo: order.outTradeNo,
      plan: order.plan,
      paidAt: order.paidAt,
      deadline: deadline.toISOString(),
    },
    requestStatus: request?.status ?? null,
  };

  if (request) {
    return {
      ...base,
      eligible: false,
      block: request.status === 'PENDING' ? 'pending' : 'already_refunded',
      usedPercent: 0,
    };
  }
  if (now > deadline) return none;
  if (refunded) return { ...base, eligible: false, block: 'already_refunded', usedPercent: 0 };

  const { percent } = usedSince(userId, order, engine);
  const eligible = percent <= REFUND_MAX_USED * 100;
  return { ...base, eligible, block: eligible ? null : 'used_too_much', usedPercent: percent };
}

/** File the request when the order qualifies. Returns the status after the attempt. */
export function requestRefund(
  userId: string,
  engine: EntitlementsEngine,
  now: Date = new Date(),
): RefundStatus {
  const status = refundStatus(userId, engine, now);
  if (!status.eligible || !status.order) return status;
  db.prepare(
    `INSERT INTO cn_refund_requests (id, outTradeNo, userId, status, usedPercent, createdAt)
     VALUES (?, ?, ?, 'PENDING', ?, ?)
     ON CONFLICT(outTradeNo) DO NOTHING`,
  ).run(randomUUID(), status.order.outTradeNo, userId, status.usedPercent, now.toISOString());
  return refundStatus(userId, engine, now);
}

export interface RefundRequestRow {
  id: string;
  outTradeNo: string;
  userId: string;
  email: string | null;
  plan: string;
  amountFen: number;
  channel: string;
  status: string;
  usedPercent: number;
  createdAt: string;
  decidedAt: string | null;
}

export function listRefundRequests(limit = 50): RefundRequestRow[] {
  const rows = db
    .prepare(
      `SELECT r.id, r.outTradeNo, r.userId, r.status, r.usedPercent, r.createdAt, r.decidedAt,
              o.plan, o.amountFen, o.channel
       FROM cn_refund_requests r JOIN cn_orders o ON o.outTradeNo = r.outTradeNo
       ORDER BY (r.status = 'PENDING') DESC, r.createdAt DESC LIMIT ?`,
    )
    .all(limit) as Omit<RefundRequestRow, 'email'>[];
  return rows.map((row) => {
    let email: string | null = null;
    try {
      email =
        (
          db.prepare('SELECT email FROM user WHERE id = ?').get(row.userId) as
            | { email: string }
            | undefined
        )?.email ?? null;
    } catch {
      // no user table outside cloud mode
    }
    return { ...row, email };
  });
}

export function requestOwner(id: string): { userId: string; email: string | null } | null {
  const row = listRefundRequests(500).find((request) => request.id === id);
  return row ? { userId: row.userId, email: row.email } : null;
}

/** Approve (the grant ends and the order is marked refunded) or reject a pending request. */
export function decideRefund(id: string, approve: boolean, now: Date = new Date()): boolean {
  return db.transaction(() => {
    const request = db
      .prepare("SELECT outTradeNo FROM cn_refund_requests WHERE id = ? AND status = 'PENDING'")
      .get(id) as { outTradeNo: string } | undefined;
    if (!request) return false;
    db.prepare('UPDATE cn_refund_requests SET status = ?, decidedAt = ? WHERE id = ?').run(
      approve ? 'APPROVED' : 'REJECTED',
      now.toISOString(),
      id,
    );
    if (approve) {
      endGrantByRef(request.outTradeNo, now);
      db.prepare("UPDATE cn_orders SET status = 'REFUNDED' WHERE outTradeNo = ?").run(
        request.outTradeNo,
      );
    }
    return true;
  })();
}
