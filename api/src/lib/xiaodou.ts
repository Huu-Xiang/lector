/**
 * Xiaodou open platform (小豆支付): one-time RMB payments through Alipay and
 * WeChat Pay. Spec: github.com/xiaodou-official/xiaodou-open-platform docs/.
 * Readfox sells fixed periods of a paid tier with it; entitlement comes from
 * plan_grants (lib/plan-grants.ts), never from this module.
 */
import { createHash, createSign, createVerify, randomBytes, randomUUID } from 'crypto';
import type { GrantPlan } from './plan-grants';

export type CnChannel = 'alipay' | 'wechat';
export type CnMonths = 1 | 12;

const CHANNELS: Record<CnChannel, string> = { alipay: 'ALIPAY_H5', wechat: 'WECHAT_H5' };

/** Platform response and webhook signing key, as published in docs/02 §3.1. */
const PUBLISHED_PLATFORM_KEYS: Record<string, string> = {
  'xdpk-2026-09': `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAw9Z3B6q8jsaNu3KmswGF
Kl/8Rc3dWV2yFCq61VIbuPVEQPI6S1S2gbFeWpXz6KzrdAJxTDyMqfSDnSStoesn
t6FCMjgc0SBflQOjxsM2ahNDJO4JmJGj7Mca/nFCMrvVTy4tLxFkxMUxOcXhn4LU
QPCvpoIc7Y10xHBrqVizrHwMWNPxteWsOG4ZQUbXDrYddsceTcZ3a46cBhBUyqas
lNkWwzjaw9KmrdcXWOjDT3YCyMAXkcjLBh/7gr+sb11P4PUCjeQl2F6dDASIjZmO
EXFRSQJtXSRlna+WHWgVSFtrWBdyq+Gf+5pwjXMk1PrSWIG56QKhCXKCylNz8Kwn
TQIDAQAB
-----END PUBLIC KEY-----`,
};

/** Price in fen (1/100 RMB) for each tier and period. */
export type CnPriceTable = Record<GrantPlan, Record<CnMonths, number>>;

export const DEFAULT_CN_PRICES: CnPriceTable = {
  cloud: { 1: 1500, 12: 14400 },
  plus: { 1: 2900, 12: 27800 },
  max: { 1: 4900, 12: 47000 },
};

export interface XiaodouConfig {
  baseUrl: string;
  appId: string;
  keyId: string;
  privateKeyPem: string;
  platformKeys: Record<string, string>;
  /** Declared trade form; required only when the app declares two. */
  tradeScope?: string;
  /** Public origin of this app, for the cashier's return link. */
  publicOrigin: string;
  prices: CnPriceTable;
}

function parsePrices(raw: string | undefined): CnPriceTable {
  if (!raw?.trim()) return DEFAULT_CN_PRICES;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<GrantPlan, Partial<Record<string, number>>>>;
    const out = structuredClone(DEFAULT_CN_PRICES);
    for (const plan of ['cloud', 'plus', 'max'] as const) {
      for (const months of [1, 12] as const) {
        const value = parsed[plan]?.[String(months)];
        if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
          out[plan][months] = value;
        }
      }
    }
    return out;
  } catch {
    console.warn('[cn-billing] XD_PRICES_FEN is not valid JSON — using default prices.');
    return DEFAULT_CN_PRICES;
  }
}

/** Null when any required setting is missing: RMB checkout is then off. */
export function xiaodouConfigFromEnv(env: NodeJS.ProcessEnv = process.env): XiaodouConfig | null {
  const baseUrl = env.XD_BASE_URL?.trim().replace(/\/+$/, '');
  const appId = env.XD_APP_ID?.trim();
  const keyId = env.XD_KEY_ID?.trim();
  const keyB64 = env.XD_PRIVATE_KEY_B64?.trim();
  const publicOrigin = (env.BETTER_AUTH_URL ?? '').trim().replace(/\/+$/, '');
  if (!baseUrl || !appId || !keyId || !keyB64 || !publicOrigin.startsWith('https://')) return null;
  return {
    baseUrl,
    appId,
    keyId,
    privateKeyPem: Buffer.from(keyB64, 'base64').toString('utf8'),
    platformKeys: PUBLISHED_PLATFORM_KEYS,
    tradeScope: env.XD_TRADE_SCOPE?.trim() || undefined,
    publicOrigin,
    prices: parsePrices(env.XD_PRICES_FEN),
  };
}

function sha256Hex(body: string | Uint8Array): string {
  return createHash('sha256').update(body).digest('hex');
}

/** XD-Signature-v1: the 11-line string a merchant request signs. */
export function requestSigningString(p: {
  method: string;
  path: string;
  query?: string;
  timestamp: number;
  nonce: string;
  appId: string;
  keyId: string;
  requestId: string;
  contentType: string;
  body: string;
}): string {
  return [
    'XD-Signature-v1',
    p.method.toUpperCase(),
    p.path,
    p.query ?? '',
    String(p.timestamp),
    p.nonce,
    p.appId,
    p.keyId,
    p.requestId,
    p.contentType.split(';', 1)[0].trim().toLowerCase(),
    sha256Hex(p.body),
  ].join('\n');
}

/** XD-Webhook-v1: the 7-line string the platform signs for an event. */
export function webhookSigningString(p: {
  eventId: string;
  eventType: string;
  timestamp: string;
  nonce: string;
  keyId: string;
  rawBody: Uint8Array | string;
}): string {
  return [
    'XD-Webhook-v1',
    p.eventId,
    p.eventType,
    p.timestamp,
    p.nonce,
    p.keyId,
    sha256Hex(p.rawBody),
  ].join('\n');
}

/** Verify a delivered event against the published platform key it names. */
export function verifyXiaodouWebhook(
  header: (name: string) => string | undefined,
  rawBody: Uint8Array,
  platformKeys: Record<string, string> = PUBLISHED_PLATFORM_KEYS,
): boolean {
  try {
    const get = (name: string) => (header(name) ?? '').trim();
    const keyId = get('x-xd-webhook-key-id');
    const publicKey = platformKeys[keyId];
    const signature = get('x-xd-webhook-signature');
    const fields = {
      eventId: get('x-xd-webhook-event-id'),
      eventType: get('x-xd-webhook-event-type'),
      timestamp: get('x-xd-webhook-timestamp'),
      nonce: get('x-xd-webhook-nonce'),
      keyId,
    };
    if (!publicKey || !signature || Object.values(fields).some((v) => v === '')) return false;
    return createVerify('RSA-SHA256')
      .update(webhookSigningString({ ...fields, rawBody }), 'utf8')
      .verify(publicKey, signature, 'base64');
  } catch {
    return false;
  }
}

export interface XiaodouOrder {
  status: string;
  payUrl: string | null;
  qrCode: string | null;
}

export class XiaodouError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`Xiaodou ${status} ${code}`);
  }
}

export interface XiaodouClient {
  createPayment(args: {
    outTradeNo: string;
    channel: CnChannel;
    amountFen: number;
    subject: string;
    payerClientIp: string;
  }): Promise<XiaodouOrder>;
  /** The platform's local ledger state of an order (CREATED … SUCCEEDED). */
  queryPayment(outTradeNo: string): Promise<{ status: string; amountFen: number }>;
}

const REQUEST_TIMEOUT_MS = 15_000;

export function makeXiaodouClient(cfg: XiaodouConfig): XiaodouClient {
  async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    const raw = body === undefined ? '' : JSON.stringify(body);
    const contentType = method === 'POST' ? 'application/json' : '';
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = randomBytes(12).toString('hex');
    const requestId = randomUUID();
    const sign = createSign('RSA-SHA256')
      .update(
        requestSigningString({
          method,
          path,
          timestamp,
          nonce,
          appId: cfg.appId,
          keyId: cfg.keyId,
          requestId,
          contentType,
          body: raw,
        }),
        'utf8',
      )
      .sign(cfg.privateKeyPem, 'base64');
    const headers: Record<string, string> = {
      'X-XD-App-Id': cfg.appId,
      'X-XD-Timestamp': String(timestamp),
      'X-XD-Nonce': nonce,
      'X-XD-Key-Id': cfg.keyId,
      'X-XD-Request-Id': requestId,
      'X-XD-Sign': sign,
    };
    if (contentType) headers['Content-Type'] = contentType;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${cfg.baseUrl}${path}`, {
        method,
        headers,
        body: method === 'POST' ? raw : undefined,
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) throw new XiaodouError(res.status, json.code ?? 'UNKNOWN');
      return json;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async createPayment(args) {
      const json = (await call('POST', '/api/open/v1/payments', {
        outTradeNo: args.outTradeNo,
        channel: CHANNELS[args.channel],
        ...(cfg.tradeScope ? { tradeScope: cfg.tradeScope } : {}),
        amountFen: args.amountFen,
        currency: 'CNY',
        subject: args.subject,
        payerClientIp: args.payerClientIp,
        returnUrl: `${cfg.publicOrigin}/subscribe`,
        attach: args.outTradeNo,
      })) as { status?: string; payUrl?: string | null; qrCode?: string | null };
      return {
        status: json.status ?? 'UNKNOWN',
        payUrl: json.payUrl ?? null,
        qrCode: json.qrCode ?? null,
      };
    },
    async queryPayment(outTradeNo) {
      const json = (await call(
        'GET',
        `/api/open/v1/payments/${encodeURIComponent(outTradeNo)}`,
      )) as { status?: string; amountFen?: number };
      return { status: json.status ?? 'UNKNOWN', amountFen: json.amountFen ?? 0 };
    },
  };
}

/** Order number: 6–64 chars of [A-Za-z0-9_-]. */
export function newOutTradeNo(): string {
  return `rf${Date.now().toString(36)}${randomBytes(6).toString('hex')}`;
}
