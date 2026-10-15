import '../test-guard';
import { beforeEach, describe, expect, test } from 'bun:test';
import { createSign, generateKeyPairSync } from 'crypto';
import { db } from '../db';
import type { EntitlementsEngine } from '../lib/entitlements';
import { activeGrant } from '../lib/plan-grants';
import {
  DEFAULT_CN_PRICES,
  webhookSigningString,
  type XiaodouClient,
  type XiaodouConfig,
} from '../lib/xiaodou';
import { makeCnBillingRoutes } from './billing-cn';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const CFG: XiaodouConfig = {
  baseUrl: 'https://xd.invalid',
  appId: 'xdop_test0000000000',
  keyId: 'mkid_0000000000000000',
  privateKeyPem: '',
  platformKeys: { kid_test: publicKey.export({ type: 'spki', format: 'pem' }).toString() },
  publicOrigin: 'https://readfox.test',
  prices: DEFAULT_CN_PRICES,
};

function engineOn(plan: string): EntitlementsEngine {
  return { resolveEntitlements: () => ({ plan }) } as unknown as EntitlementsEngine;
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
    queryPayment: async () => ({ status: 'PAYING', amountFen: 0 }),
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

let eventSeq = 0;
function signedEvent(payload: Record<string, unknown>) {
  const eventId = `evt_${++eventSeq}_${Date.now()}`;
  const raw = JSON.stringify({ eventId, ...payload });
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-XD-Webhook-Key-Id': 'kid_test',
    'X-XD-Webhook-Event-Id': eventId,
    'X-XD-Webhook-Event-Type': String(payload.eventType),
    'X-XD-Webhook-Timestamp': '1792000000',
    'X-XD-Webhook-Nonce': 'nonce-123456789012',
  };
  headers['X-XD-Webhook-Signature'] = createSign('RSA-SHA256')
    .update(
      webhookSigningString({
        eventId,
        eventType: String(payload.eventType),
        timestamp: '1792000000',
        nonce: 'nonce-123456789012',
        keyId: 'kid_test',
        rawBody: raw,
      }),
    )
    .sign(privateKey, 'base64');
  return { raw, headers };
}

async function checkout(app: ReturnType<typeof makeCnBillingRoutes>, plan = 'cloud', months = 1) {
  const res = await post(app, '/checkout', { plan, months, channel: 'alipay' });
  return { res, body: (await res.json()) as { outTradeNo: string; payUrl: string } };
}

beforeEach(() => {
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

describe('Xiaodou webhook', () => {
  test('a signed PAYMENT_SUCCEEDED grants the period once', async () => {
    const app = makeCnBillingRoutes(CFG, fakeClient().client, engineOn('free'), () => false);
    const { body } = await checkout(app, 'cloud', 1);
    const event = signedEvent({
      eventType: 'PAYMENT_SUCCEEDED',
      outTradeNo: body.outTradeNo,
      eventAmountFen: 1500,
      grossAmountFen: 1500,
    });
    const first = await app.request('/webhook', {
      method: 'POST',
      headers: event.headers,
      body: event.raw,
    });
    expect(first.status).toBe(200);
    expect(await first.text()).toBe('success');
    const again = await app.request('/webhook', {
      method: 'POST',
      headers: event.headers,
      body: event.raw,
    });
    expect(await again.text()).toBe('success');
    expect(activeGrant('local')?.plan).toBe('cloud');
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM plan_grants WHERE userId = 'local'").get(),
    ).toEqual({ n: 1 });
  });

  test('rejects a bad signature and does not grant on a wrong amount', async () => {
    const app = makeCnBillingRoutes(CFG, fakeClient().client, engineOn('free'), () => false);
    const { body } = await checkout(app, 'max', 1);
    const wrong = signedEvent({
      eventType: 'PAYMENT_SUCCEEDED',
      outTradeNo: body.outTradeNo,
      eventAmountFen: 1,
      grossAmountFen: 1,
    });
    const forged = await app.request('/webhook', {
      method: 'POST',
      headers: { ...wrong.headers, 'X-XD-Webhook-Signature': 'AAAA' },
      body: wrong.raw,
    });
    expect(forged.status).toBe(400);
    await app.request('/webhook', { method: 'POST', headers: wrong.headers, body: wrong.raw });
    expect(activeGrant('local')).toBeNull();
  });

  test('a full refund ends the period', async () => {
    const app = makeCnBillingRoutes(CFG, fakeClient().client, engineOn('free'), () => false);
    const { body } = await checkout(app, 'cloud', 12);
    for (const eventType of ['PAYMENT_SUCCEEDED', 'REFUND_SUCCEEDED']) {
      const event = signedEvent({
        eventType,
        outTradeNo: body.outTradeNo,
        eventAmountFen: 14400,
        grossAmountFen: 14400,
      });
      await app.request('/webhook', { method: 'POST', headers: event.headers, body: event.raw });
    }
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
