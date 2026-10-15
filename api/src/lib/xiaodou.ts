/**
 * Xiaodou Pay (小豆支付) through its 易支付-compatible protocol: one-time RMB
 * payments with Alipay or WeChat Pay, signed with the shared merchant key.
 * Spec: github.com/xiaodou-official/xiaodou-open-platform docs/13.
 * Readfox sells fixed periods of a paid tier with it; entitlement comes from
 * plan_grants (lib/plan-grants.ts), never from this module.
 */
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { GrantPlan } from './plan-grants';

export type CnChannel = 'alipay' | 'wechat';
export type CnMonths = 1 | 12;

const PAY_TYPES: Record<CnChannel, string> = { alipay: 'alipay', wechat: 'wxpay' };

/** Price in fen (1/100 RMB) for each tier and period. */
export type CnPriceTable = Record<GrantPlan, Record<CnMonths, number>>;

export const DEFAULT_CN_PRICES: CnPriceTable = {
  cloud: { 1: 1500, 12: 14400 },
  plus: { 1: 2900, 12: 27800 },
  max: { 1: 4900, 12: 47000 },
};

export interface XiaodouConfig {
  /** Gateway base, e.g. https://pay.xiaodouap.cn (no path). */
  gateway: string;
  pid: string;
  key: string;
  /** Public origin of this app, for the notify and return links. */
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
  const gateway = env.XD_GATEWAY?.trim()
    .replace(/\/(submit|mapi|api)\.php$/, '')
    .replace(/\/+$/, '');
  const pid = env.XD_PID?.trim();
  const key = env.XD_KEY?.trim();
  const publicOrigin = (env.XD_PUBLIC_ORIGIN ?? env.BETTER_AUTH_URL ?? '')
    .trim()
    .replace(/\/+$/, '');
  if (!gateway?.startsWith('https://') || !pid || !key || !publicOrigin.startsWith('https://')) {
    return null;
  }
  return { gateway, pid, key, publicOrigin, prices: parsePrices(env.XD_PRICES_FEN) };
}

/** 易支付 MD5 signature: sorted non-empty params (minus sign fields) + key. */
export function epaySign(params: Record<string, string>, key: string): string {
  const text = Object.keys(params)
    .filter((k) => k !== 'sign' && k !== 'sign_type' && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return createHash('md5')
    .update(text + key, 'utf8')
    .digest('hex');
}

/** Verify a payment notice (or return-link query) from the gateway. */
export function verifyEpayNotice(params: Record<string, string>, cfg: XiaodouConfig): boolean {
  if (params.pid !== cfg.pid || typeof params.sign !== 'string') return false;
  const expected = Buffer.from(epaySign(params, cfg.key));
  const given = Buffer.from(params.sign.toLowerCase());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function fenToYuan(fen: number): string {
  return (fen / 100).toFixed(2);
}

export function yuanToFen(yuan: string): number {
  const value = Number(yuan);
  return Number.isFinite(value) ? Math.round(value * 100) : NaN;
}

export interface XiaodouOrder {
  payUrl: string | null;
  qrCode: string | null;
}

export class XiaodouError extends Error {
  constructor(readonly detail: string) {
    super(`Xiaodou: ${detail}`);
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
  /** SUCCEEDED once the gateway reports the order paid. */
  queryPayment(outTradeNo: string): Promise<{ status: 'SUCCEEDED' | 'PENDING'; amountFen: number }>;
}

const REQUEST_TIMEOUT_MS = 15_000;

async function fetchJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new XiaodouError(`HTTP ${res.status}, not JSON`);
    }
  } finally {
    clearTimeout(timer);
  }
}

export function makeXiaodouClient(cfg: XiaodouConfig): XiaodouClient {
  return {
    async createPayment(args) {
      const params: Record<string, string> = {
        pid: cfg.pid,
        type: PAY_TYPES[args.channel],
        out_trade_no: args.outTradeNo,
        notify_url: `${cfg.publicOrigin}/api/billing/cn/webhook`,
        return_url: `${cfg.publicOrigin}/subscribe`,
        name: args.subject,
        money: fenToYuan(args.amountFen),
        clientip: args.payerClientIp,
      };
      params.sign = epaySign(params, cfg.key);
      params.sign_type = 'MD5';
      const json = await fetchJson(`${cfg.gateway}/mapi.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
      });
      if (Number(json.code) !== 1) throw new XiaodouError(String(json.msg ?? 'rejected'));
      const payUrl = (json.payurl ?? json.payUrl ?? json.pay_url ?? null) as string | null;
      const qrCode = (json.qrcode ?? json.qrCode ?? null) as string | null;
      return { payUrl, qrCode };
    },
    async queryPayment(outTradeNo) {
      const query = new URLSearchParams({
        act: 'order',
        pid: cfg.pid,
        key: cfg.key,
        out_trade_no: outTradeNo,
      });
      const json = await fetchJson(`${cfg.gateway}/api.php?${query}`, { method: 'GET' });
      if (Number(json.code) !== 1) throw new XiaodouError(String(json.msg ?? 'query failed'));
      return {
        status: Number(json.status) === 1 ? 'SUCCEEDED' : 'PENDING',
        amountFen: yuanToFen(String(json.money ?? '0')),
      };
    },
  };
}

/** Order number: 6–64 chars of [A-Za-z0-9_-]. */
export function newOutTradeNo(): string {
  return `rf${Date.now().toString(36)}${randomBytes(6).toString('hex')}`;
}
