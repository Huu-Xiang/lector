import { describe, expect, it } from 'vitest';
import { detectInstallPlatform } from './pwa';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const WECHAT = `${IPHONE} MicroMessenger/8.0.50(0x18003231) NetType/WIFI Language/zh_CN`;

const base = { maxTouchPoints: 0, standalone: false, hasPrompt: false };

describe('detectInstallPlatform', () => {
  it('reports an installed app first', () => {
    expect(detectInstallPlatform({ ...base, userAgent: IPHONE, standalone: true })).toBe(
      'installed',
    );
  });

  it('sends WeChat users to a real browser, even with a prompt', () => {
    expect(detectInstallPlatform({ ...base, userAgent: WECHAT, hasPrompt: true })).toBe('wechat');
  });

  it('prefers the browser prompt when one is saved', () => {
    expect(detectInstallPlatform({ ...base, userAgent: ANDROID, hasPrompt: true })).toBe('prompt');
  });

  it('detects iPhone and an iPad that reports a Mac user agent', () => {
    expect(detectInstallPlatform({ ...base, userAgent: IPHONE })).toBe('ios');
    expect(detectInstallPlatform({ ...base, userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 5 })).toBe(
      'ios',
    );
  });

  it('treats a Mac without touch as desktop', () => {
    expect(detectInstallPlatform({ ...base, userAgent: IPAD_DESKTOP_UA })).toBe('desktop');
  });

  it('falls back to menu steps on Android without a prompt', () => {
    expect(detectInstallPlatform({ ...base, userAgent: ANDROID })).toBe('android');
  });
});
