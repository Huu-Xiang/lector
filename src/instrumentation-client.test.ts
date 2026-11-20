import { describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({
  init: vi.fn(),
  browserTracingIntegration: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
}));

import { DEFAULT_TRACES_SAMPLE_RATE, parseTracesSampleRate } from './instrumentation-client';

describe('parseTracesSampleRate', () => {
  it('defaults to 0.1 when unset or blank', () => {
    expect(DEFAULT_TRACES_SAMPLE_RATE).toBe(0.1);
    expect(parseTracesSampleRate(undefined)).toBe(0.1);
    expect(parseTracesSampleRate('')).toBe(0.1);
    expect(parseTracesSampleRate('not-a-number')).toBe(0.1);
  });

  it('preserves explicit numeric rates including 0', () => {
    expect(parseTracesSampleRate('0')).toBe(0);
    expect(parseTracesSampleRate('0.5')).toBe(0.5);
    expect(parseTracesSampleRate('1')).toBe(1);
  });
});
