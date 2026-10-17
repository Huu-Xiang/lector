import '../test-guard';
import { beforeEach, describe, expect, test } from 'bun:test';
import { db } from '../db';
import type { EntitlementsEngine } from '../lib/entitlements';
import { activeGrant } from '../lib/plan-grants';
import { decideRefund, listRefundRequests } from '../lib/cn-refund';
import {
  DEFAULT_CN_PRICES,
  epaySign,
  type XiaodouClient,
  type XiaodouConfig,
} from '../lib/xiaodou';
import { makeCnBillingRoutes } from './billing-cn';

const CFG: XiaodouConfig = {
  gateway: 'https://pay.invalid',
  pid: '1001',
  key: 'secretkey',
  publicOrigin: 'https://readfox.test',
  prices: DEFAULT_CN_PRICES,
};

const usage = { llmRequestsPerMonth: 0, wordGlossesPerMonth: 0 };

function engineOn(plan: string): EntitlementsEngine {
  return {
    resolveEntitlements: () => ({
      plan,
      limits: { llmRequestsPerMonth: 300, wordGlossesPerMonth: 5_000 },
    }),
    currentPeriods: () => ({ month: '2026-10', day: '2026-10-17' }),
    getUsage: (_userId: string, metric: keyof typeof usage) => usage[metric],
  } as unknown as EntitlementsEngine;
}

function fakeClient(overrides: Partial<XiaodouClient> = {}) {
  const created: Array<Parameters<XiaodouClient['createPayment']>[0]> = [];
  const client: XiaodouClient = {
    createPayment: async (args) => {
      created.push(args);
      return {
        status: 'PAYING',
        payUrl: `https://cashier.invalid/${args.outTradeNo}`,
        qrCode: null,
      };
    },
    queryPayment: async () => ({ status: 'PENDING', amountFen: 0 }),
    ...overrides,
  };
  return { client, created };
}

function post(app: ReturnType<typeof makeCnBillingRoutes>, path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.114.7' },
    body: JSON.stringify(body),
  });
}

function notice(outTradeNo: string, money: string, extra: Record<string, string> = {}) {
  const params: Record<string, string> = {
    pid: '1001',
    trade_no: `T${outTradeNo}`,
    out_trade_no: outTradeNo,
    type: 'alipay',
    name: 'Readfox',
    money,
    trade_status: 'TRADE_SUCCESS',
    ...extra,
  };
  params.sign = epaySign(params, 'secretkey');
  params.sign_type = 'MD5';
  return `/webhook?${new URLSearchParams(params)}`;
}

async function checkout(app: ReturnType<typeof makeCnBillingRoutes>, plan = 'cloud', months = 1) {
  const res = await post(app, '/checkout', { plan, months, channel: 'alipay' });
  return { res, body: (await res.json()) as { outTradeNo: string; payUrl: string } };
}

beforeEach(() => {
  usage.llmRequestsPerMonth = 0;
  usage.wordGlossesPerMonth = 0;
  db.prepare("DELETE FROM cn_refund_requests WHERE userId = 'local'").run();
  db.prepare("DELETE FROM cn_orders WHERE userId = 'local'").run();
  db.prepare("DELETE FROM plan_grants WHERE userId = 'local'").run();
});

describe('RMB checkout', () => {
  test('creates an order at the table price and returns the cashier link', async () => {
    const { client, created } = fakeClient();
    const app = makeCnBillingRoutes(CFG, client, engineOn('free'), () => false);
    const { res, body } = await checkout(app, 'plus', 12);
    expect(res.status).toBe(200);
    expect(body.payUrl).toContain(body.outTradeNo);
    expect(created[0]).toMatchObject({
      amountFen: 27800,
      channel: 'alipay',
      payerClientIp: '203.0.114.7',
    });
  });

  test('refuses a lower tier, an active Paddle subscription, and bad input', async () => {
    const { client } = fakeClient();
    expect(
      (await checkout(makeCnBillingRoutes(CFG, client, engineOn('max'), () => false))).res.status,
    ).toBe(409);
    expect(
      (await checkout(makeCnBillingRoutes(CFG, client, engineOn('free'), () => true))).res.status,
    ).toBe(409);
    const app = makeCnBillingRoutes(CFG, client, engineOn('free'), () => false);
    expect(
      (await post(app, '/checkout', { plan: 'gold', months: 1, channel: 'alipay' })).status,
    ).toBe(400);
    expect(
      (await post(app, '/checkout', { plan: 'cloud', months: 3, channel: 'alipay' })).status,
    ).toBe(400);
  });

  test('is off without configuration', async () => {
    const app = makeCnBillingRoutes(null, null, engineOn('free'), () => false);
    expect(await (await app.request('/options')).json()).toEqual({ enabled: false, prices: [] });
    expect((await checkout(app)).res.status).toBe(404);
  });
});

describe('payment notice', () => {
  test('a signed TRADE_SUCCESS grants the period once', async () => {
    const app = makeCnBillingRoutes(CFG, fakeClient().client, engineOn('free'), () => false);
    const { body } = await checkout(app, 'cloud', 1);
    const first = await app.request(notice(body.outTradeNo, '15.00'));
    expect(first.status).toBe(200);
    expect(await first.text()).toBe('success');
    expect(await (await app.request(notice(body.outTradeNo, '15.00'))).text()).toBe('success');
    expect(activeGrant('local')?.plan).toBe('cloud');
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM plan_grants WHERE userId = 'local'").get(),
    ).toEqual({ n: 1 });
  });

  test('a form POST works the same way', async () => {
    const app = makeCnBillingRoutes(CFG, fakeClient().client, engineOn('free'), () => false);
    const { body } = await checkout(app, 'plus', 1);
    const query = notice(body.outTradeNo, '29.00').split('?')[1];
    const res = await app.request('/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: query,
    });
    expect(await res.text()).toBe('success');
    expect(activeGrant('local')?.plan).toBe('plus');
  });

  test('rejects a bad signature and does not grant on a wrong amount', async () => {
    const app = makeCnBillingRoutes(CFG, fakeClient().client, engineOn('free'), () => false);
    const { body } = await checkout(app, 'max', 1);
    const forged = notice(body.outTradeNo, '49.00').replace(/sign=[0-9a-f]+/, 'sign=deadbeef');
    expect((await app.request(forged)).status).toBe(400);
    await app.request(notice(body.outTradeNo, '0.01'));
    expect(activeGrant('local')).toBeNull();
  });
});

describe('order polling', () => {
  test('recovers a missed webhook by asking the platform', async () => {
    const { client } = fakeClient({
      queryPayment: async () => ({ status: 'SUCCEEDED', amountFen: 2900 }),
    });
    const app = makeCnBillingRoutes(CFG, client, engineOn('free'), () => false);
    const { body } = await checkout(app, 'plus', 1);
    const res = await app.request(`/orders/${body.outTradeNo}`);
    expect(await res.json()).toMatchObject({ status: 'SUCCEEDED', plan: 'plus', months: 1 });
    expect(activeGrant('local')?.plan).toBe('plus');
    expect((await app.request('/orders/rf-not-mine')).status).toBe(404);
  });
});

describe('refund requests', () => {
  async function paidOrder(app: ReturnType<typeof makeCnBillingRoutes>) {
    const { body } = await checkout(app);
    await app.request(notice(body.outTradeNo, '15.00'));
    return body.outTradeNo;
  }
  const get = (app: ReturnType<typeof makeCnBillingRoutes>) => app.request('/refund');
  const file = (app: ReturnType<typeof makeCnBillingRoutes>) =>
    app.request('/refund', { method: 'POST' });

  test('a fresh, barely used order can be refunded; the owner approval ends the plan', async () => {
    const app = makeCnBillingRoutes(CFG, fakeClient().client, engineOn('cloud'), () => false);
    const outTradeNo = await paidOrder(app);
    expect(activeGrant('local')?.plan).toBe('cloud');
    usage.wordGlossesPerMonth = 100; // 2% of 5000

    const before = await (await get(app)).json();
    expect(before).toMatchObject({ eligible: true, block: null });
    expect(before.order.outTradeNo).toBe(outTradeNo);

    const filed = await (await file(app)).json();
    expect(filed).toMatchObject({ eligible: false, block: 'pending', requestStatus: 'PENDING' });

    const pending = listRefundRequests().filter((r) => r.outTradeNo === outTradeNo);
    expect(pending).toHaveLength(1);
    expect(decideRefund(pending[0].id, true)).toBe(true);
    expect(activeGrant('local')).toBeNull();
    expect(decideRefund(pending[0].id, true)).toBe(false);
    expect(await (await get(app)).json()).toMatchObject({ block: 'already_refunded' });
  });

  test('use after payment above 10% blocks the request, use before payment does not', async () => {
    usage.wordGlossesPerMonth = 900; // used on Free before paying
    const app = makeCnBillingRoutes(CFG, fakeClient().client, engineOn('cloud'), () => false);
    await paidOrder(app);
    expect((await (await get(app)).json()).eligible).toBe(true);

    usage.wordGlossesPerMonth = 900 + 600; // 12% of 5000 since payment
    const blocked = await (await file(app)).json();
    expect(blocked).toMatchObject({ eligible: false, block: 'used_too_much' });
    expect(listRefundRequests().filter((r) => r.userId === 'local')).toHaveLength(0);
  });

  test('no request after 24 hours, and none without an order', async () => {
    const app = makeCnBillingRoutes(CFG, fakeClient().client, engineOn('cloud'), () => false);
    expect(await (await get(app)).json()).toMatchObject({ order: null, block: 'no_order' });
    const outTradeNo = await paidOrder(app);
    db.prepare('UPDATE cn_orders SET paidAt = ? WHERE outTradeNo = ?').run(
      new Date(Date.now() - 25 * 3_600_000).toISOString(),
      outTradeNo,
    );
    expect(await (await get(app)).json()).toMatchObject({ order: null, eligible: false });
    expect(await (await file(app)).json()).toMatchObject({ eligible: false });
  });
});
