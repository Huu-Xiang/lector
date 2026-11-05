import { describe, expect, it } from 'vitest';
import { detectNativeApp, isNativeUserAgent } from './native-app';

const SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';

describe('detectNativeApp', () => {
  it('counts the app user-agent mark as the app', () => {
    expect(detectNativeApp({ userAgent: `${SAFARI} ReadfoxApp/1`, capacitorNative: false })).toBe(
      true,
    );
  });

  it('counts the Capacitor flag as the app even with a plain user agent', () => {
    expect(detectNativeApp({ userAgent: SAFARI, capacitorNative: true })).toBe(true);
  });

  it('leaves mobile Safari and desktop browsers as the web', () => {
    expect(detectNativeApp({ userAgent: SAFARI, capacitorNative: false })).toBe(false);
    expect(detectNativeApp({ userAgent: 'Mozilla/5.0 Chrome/130', capacitorNative: false })).toBe(
      false,
    );
  });
});

describe('isNativeUserAgent', () => {
  it('reads the mark from a request header value', () => {
    expect(isNativeUserAgent(`${SAFARI} ReadfoxApp/2.1`)).toBe(true);
    expect(isNativeUserAgent(SAFARI)).toBe(false);
    expect(isNativeUserAgent(null)).toBe(false);
  });
});
