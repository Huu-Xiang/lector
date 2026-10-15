import { Hono, type Context } from 'hono';
import { isIP } from 'net';
import { db } from '../db';
import { getCurrentUserId } from '../lib/user';
import { getUserEmail, isEntitledStatus, resolveBillingStatus } from '../lib/billing';
import { entitlements, type EntitlementsEngine } from '../lib/entitlements';
import { grantPlan, planRank, type GrantPlan } from '../lib/plan-grants';
import {
  makeXiaodouClient,
  newOutTradeNo,
  verifyXiaodouWebhook,
  xiaodouConfigFromEnv,
  XiaodouError,
  type CnChannel,
  type CnMonths,
  type XiaodouClient,
  type XiaodouConfig,
} from '../lib/xiaodou';

const PLAN_LABEL: Record<GrantPlan, string> = { cloud: 'Plus', plus: 'Pro', max: 'Max' };

interface CnOrderRow {
  outTradeNo: string;
  userId: string;
  plan: GrantPlan;
  months: number;
  amountFen: number;
  status: string;
}

function isPlan(value: unknown): value is GrantPlan {
  return value === 'cloud' || value === 'plus' || value === 'max';
}

function isPublicIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const [a, b] = ip.split('.').map(Number);
    return !(
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (family === 6) {
    const lower = ip.toLowerCase();
    return !(
      lower === '::1' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe80')
    );
  }
  return false;
}

/** Caddy sets X-Forwarded-For to the visitor's address (it is the only proxy). */
function payerIp(c: Context): string | null {
  const first = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  return isPublicIp(first) ? first : null;
}

function findOrder(outTradeNo: string): CnOrderRow | undefined {
  return db
    .prepare(
      'SELECT outTradeNo, userId, plan, months, amountFen, status FROM cn_orders WHERE outTradeNo = ?',
    )
    .get(outTradeNo) as CnOrderRow | undefined;
}

/** Mark an order paid and grant its period. Safe to call more than once. */
export function settleCnOrder(outTradeNo: string, paidFen: number, now = new Date()): boolean {
  return db.transaction(() => {
    const order = findOrder(outTradeNo);
    if (!order) return false;
    if (order.status === 'SUCCEEDED') return true;
    if (paidFen !== order.amountFen) {
      console.error(`[cn-billing] ${outTradeNo}: paid ${paidFen} fen, expected ${order.amountFen}`);
      db.prepare("UPDATE cn_orders SET status = 'AMOUNT_MISMATCH' WHERE outTradeNo = ?").run(
        outTradeNo,
      );
      return false;
    }
    db.prepare("UPDATE cn_orders SET status = 'SUCCEEDED', paidAt = ? WHERE outTradeNo = ?").run(
      now.toISOString(),
      outTradeNo,
    );
    grantPlan({
      userId: order.userId,
      plan: order.plan,
      months: order.months,
      source: 'xiaodou',
      ref: outTradeNo,
      now,
    });
    return true;
  })();
}

/** A full refund ends the period the order bought. */
function revokeCnOrder(outTradeNo: string, now = new Date()): void {
  db.transaction(() => {
    db.prepare("UPDATE cn_orders SET status = 'REFUNDED' WHERE outTradeNo = ?").run(outTradeNo);
    db.prepare(
      "UPDATE plan_grants SET endsAt = ? WHERE ref = ? AND source = 'xiaodou' AND endsAt > ?",
    ).run(now.toISOString(), outTradeNo, now.toISOString());
  })();
}

export function makeCnBillingRoutes(
  cfg: XiaodouConfig | null,
  client: XiaodouClient | null,
  engine: EntitlementsEngine = entitlements,
  hasPaddleSubscription: (userId: string) => boolean = (userId) =>
    isEntitledStatus(resolveBillingStatus(userId, getUserEmail(userId))),
) {
  const app = new Hono();

  app.get('/options', (c) => {
    if (!cfg) return c.json({ enabled: false, prices: [] });
    const prices = (['cloud', 'plus', 'max'] as const).flatMap((plan) =>
      ([1, 12] as const).map((months) => ({ plan, months, amountFen: cfg.prices[plan][months] })),
    );
    return c.json({ enabled: true, prices });
  });

  app.post('/checkout', async (c) => {
    if (!cfg || !client) return c.json({ error: 'cn_checkout_unavailable' }, 404);
    const userId = getCurrentUserId(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      plan?: unknown;
      months?: unknown;
      channel?: unknown;
    };
    if (!isPlan(body.plan)) return c.json({ error: 'invalid_plan' }, 400);
    if (body.months !== 1 && body.months !== 12) return c.json({ error: 'invalid_months' }, 400);
    if (body.channel !== 'alipay' && body.channel !== 'wechat') {
      return c.json({ error: 'invalid_channel' }, 400);
    }
    const plan = body.plan;
    const months = body.months as CnMonths;
    const channel = body.channel as CnChannel;

    if (hasPaddleSubscription(userId)) return c.json({ error: 'subscription_active' }, 409);
    const current = engine.resolveEntitlements(userId).plan;
    if (isPlan(current) && planRank(current) > planRank(plan)) {
      return c.json({ error: 'higher_plan_active' }, 409);
    }
    const ip = payerIp(c);
    if (!ip) return c.json({ error: 'client_ip_unknown' }, 400);

    const outTradeNo = newOutTradeNo();
    const amountFen = cfg.prices[plan][months];
    db.prepare(
      `INSERT INTO cn_orders (outTradeNo, userId, plan, months, amountFen, channel, status, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, 'CREATED', ?)`,
    ).run(outTradeNo, userId, plan, months, amountFen, channel, new Date().toISOString());

    try {
      const order = await client.createPayment({
        outTradeNo,
        channel,
        amountFen,
        subject: `Readfox ${PLAN_LABEL[plan]} · ${months} 个月`,
        payerClientIp: ip,
      });
      if (!order.payUrl) throw new XiaodouError(502, 'NO_PAY_URL');
      return c.json({ outTradeNo, payUrl: order.payUrl, qrCode: order.qrCode });
    } catch (error) {
      console.error('[cn-billing] create payment failed:', (error as Error).message);
      db.prepare("UPDATE cn_orders SET status = 'FAILED' WHERE outTradeNo = ?").run(outTradeNo);
      return c.json({ error: 'cn_checkout_failed' }, 502);
    }
  });

  // The page polls this after the cashier sends the buyer back. A missed
  // webhook is recovered here by asking the platform for the order state.
  app.get('/orders/:outTradeNo', async (c) => {
    const userId = getCurrentUserId(c);
    const order = findOrder(c.req.param('outTradeNo'));
    if (!order || order.userId !== userId) return c.json({ error: 'not_found' }, 404);
    if (order.status !== 'SUCCEEDED' && client) {
      try {
        const remote = await client.queryPayment(order.outTradeNo);
        if (remote.status === 'SUCCEEDED') settleCnOrder(order.outTradeNo, remote.amountFen);
      } catch (error) {
        console.warn('[cn-billing] order query failed:', (error as Error).message);
      }
    }
    const fresh = findOrder(order.outTradeNo)!;
    return c.json({ status: fresh.status, plan: fresh.plan, months: fresh.months });
  });

  app.post('/webhook', async (c) => {
    if (!cfg) return c.text('', 404);
    const raw = new Uint8Array(await c.req.arrayBuffer());
    if (!verifyXiaodouWebhook((name) => c.req.header(name), raw, cfg.platformKeys)) {
      console.error('[cn-billing] webhook signature rejected');
      return c.text('', 400);
    }
    let event: {
      eventId?: string;
      eventType?: string;
      outTradeNo?: string;
      eventAmountFen?: number;
      grossAmountFen?: number;
    };
    try {
      event = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      return c.text('', 400);
    }
    if (!event.eventId || !event.outTradeNo) return c.text('', 400);
    try {
      db.transaction(() => {
        const inserted = db
          .prepare('INSERT OR IGNORE INTO cn_webhook_events (eventId, receivedAt) VALUES (?, ?)')
          .run(event.eventId!, new Date().toISOString());
        if (inserted.changes === 0) return;
        if (event.eventType === 'PAYMENT_SUCCEEDED') {
          settleCnOrder(event.outTradeNo!, event.eventAmountFen ?? 0);
        } else if (
          event.eventType === 'REFUND_SUCCEEDED' &&
          event.eventAmountFen === event.grossAmountFen
        ) {
          revokeCnOrder(event.outTradeNo!);
        } else if (event.eventType === 'PAYMENT_CLOSED' || event.eventType === 'PAYMENT_FAILED') {
          db.prepare(
            "UPDATE cn_orders SET status = ? WHERE outTradeNo = ? AND status != 'SUCCEEDED'",
          ).run(event.eventType === 'PAYMENT_CLOSED' ? 'CLOSED' : 'FAILED', event.outTradeNo!);
        }
      })();
    } catch (error) {
      console.error('[cn-billing] webhook handling failed:', (error as Error).message);
      return c.text('', 500);
    }
    return c.text('success');
  });

  return app;
}

const cfg = xiaodouConfigFromEnv();
export default makeCnBillingRoutes(cfg, cfg ? makeXiaodouClient(cfg) : null);
