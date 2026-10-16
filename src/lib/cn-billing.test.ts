import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { forgetCnOrder, rememberCnOrder, takeRememberedCnOrder } from './cn-billing';

const KEY = 'readfox-cn-order';
let stored: Map<string, string>;

beforeEach(() => {
  stored = new Map();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
    removeItem: (k: string) => void stored.delete(k),
  };
});

afterEach(() => {
  delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
});

describe('pending RMB order', () => {
  it('keeps the order number and the cashier link', () => {
    rememberCnOrder({ outTradeNo: 'rf123456', payUrl: 'https://pay.example/cashier/1' });
    expect(takeRememberedCnOrder()).toEqual({
      outTradeNo: 'rf123456',
      payUrl: 'https://pay.example/cashier/1',
    });
  });

  it('reads a bare order number stored by an older build', () => {
    stored.set(KEY, 'rfmv9dafy9492f4afbf133');
    expect(takeRememberedCnOrder()).toEqual({ outTradeNo: 'rfmv9dafy9492f4afbf133' });
  });

  it('returns null when nothing is pending', () => {
    rememberCnOrder({ outTradeNo: 'rf123456' });
    forgetCnOrder();
    expect(takeRememberedCnOrder()).toBeNull();
  });
});
