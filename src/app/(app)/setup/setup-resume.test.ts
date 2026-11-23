import { beforeEach, describe, expect, it } from 'vitest';
import {
  SETUP_RESUME_KEY,
  canEnterPreferences,
  consumeSetupResume,
  writeSetupResume,
} from './setup-resume';

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
});

describe('canEnterPreferences', () => {
  it('allows valid non-clashing native and target pairs', () => {
    expect(canEnterPreferences('de', 'en')).toBe(true);
    expect(canEnterPreferences('zh-CN', 'en')).toBe(true);
    expect(canEnterPreferences('en', 'es')).toBe(true);
  });

  it('rejects null or clashing native/target pairs', () => {
    expect(canEnterPreferences('de', null)).toBe(false);
    expect(canEnterPreferences('en', 'en')).toBe(false);
    expect(canEnterPreferences('zh-CN', 'zh')).toBe(false);
    expect(canEnterPreferences('zh-TW', 'zh')).toBe(false);
    expect(canEnterPreferences('ru', 'ru')).toBe(false);
  });
});

describe('setup resume sessionStorage helper', () => {
  it('round-trips a non-UI-locale native (de) with target English (en)', () => {
    writeSetupResume('de', 'en');
    expect(store.has(SETUP_RESUME_KEY)).toBe(true);

    expect(consumeSetupResume()).toEqual({
      step: 'preferences',
      native: 'de',
      targetLanguage: 'en',
    });
  });

  it('consumes the marker once and clears sessionStorage', () => {
    writeSetupResume('fr', 'en');
    expect(consumeSetupResume()).toEqual({
      step: 'preferences',
      native: 'fr',
      targetLanguage: 'en',
    });
    expect(store.has(SETUP_RESUME_KEY)).toBe(false);
    expect(consumeSetupResume()).toBeNull();
  });

  it('does not write clashing or null target selections', () => {
    writeSetupResume('en', 'en');
    expect(store.has(SETUP_RESUME_KEY)).toBe(false);

    writeSetupResume('zh-CN', 'zh');
    expect(store.has(SETUP_RESUME_KEY)).toBe(false);

    writeSetupResume('de', null);
    expect(store.has(SETUP_RESUME_KEY)).toBe(false);

    writeSetupResume('xx', 'en');
    expect(store.has(SETUP_RESUME_KEY)).toBe(false);
  });

  it('rejects stored clashing native/target pairs and clears storage', () => {
    store.set(
      SETUP_RESUME_KEY,
      JSON.stringify({ step: 'preferences', native: 'en', targetLanguage: 'en' }),
    );
    expect(consumeSetupResume()).toBeNull();
    expect(store.has(SETUP_RESUME_KEY)).toBe(false);

    store.set(
      SETUP_RESUME_KEY,
      JSON.stringify({ step: 'preferences', native: 'zh-TW', targetLanguage: 'zh' }),
    );
    expect(consumeSetupResume()).toBeNull();
    expect(store.has(SETUP_RESUME_KEY)).toBe(false);
  });

  it('ignores missing, malformed, wrong-step, unknown-language, and prototype-key markers', () => {
    expect(consumeSetupResume()).toBeNull();

    const invalidPayloads = [
      'not json',
      'null',
      JSON.stringify({ step: 'languages', native: 'de', targetLanguage: 'en' }),
      JSON.stringify({ step: 'preferences', native: 'zz', targetLanguage: 'en' }),
      JSON.stringify({ step: 'preferences', native: 'de', targetLanguage: 'zz' }),
      JSON.stringify({ step: 'preferences', native: 'de', targetLanguage: 'constructor' }),
      JSON.stringify({ step: 'preferences', native: 'de', targetLanguage: '__proto__' }),
      JSON.stringify({ step: 'preferences', native: 123, targetLanguage: 'en' }),
    ];

    for (const payload of invalidPayloads) {
      store.set(SETUP_RESUME_KEY, payload);
      expect(consumeSetupResume()).toBeNull();
      expect(store.has(SETUP_RESUME_KEY)).toBe(false);
    }
  });

  it('handles blocked sessionStorage without throwing', () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    expect(() => writeSetupResume('de', 'en')).not.toThrow();
    expect(consumeSetupResume()).toBeNull();
  });
});
