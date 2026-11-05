import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const { pickLocale, nextStep } = createRequire(import.meta.url)('./logic.js') as {
  pickLocale: (stored: string | null, device: string) => string;
  nextStep: (health: { ok: boolean } | null, cached: number) => string;
};

describe('nextStep', () => {
  it('opens the site when the health check passes', () => {
    expect(nextStep({ ok: true }, 0)).toBe('open');
    expect(nextStep({ ok: true }, 3)).toBe('open');
  });

  it('shows the error screen when the check fails and nothing is cached', () => {
    expect(nextStep({ ok: false }, 0)).toBe('error');
    expect(nextStep(null, 0)).toBe('error');
  });

  it('shows the offline list when the check fails and lessons are cached', () => {
    expect(nextStep({ ok: false }, 2)).toBe('offline');
  });
});

describe('pickLocale', () => {
  it('uses the stored interface locale when it is supported', () => {
    expect(pickLocale('zh-TW', 'en-US')).toBe('zh-TW');
  });

  it('falls back to the device language when nothing is stored', () => {
    expect(pickLocale(null, 'zh-Hant-TW')).toBe('zh-TW');
    expect(pickLocale(null, 'zh-HK')).toBe('zh-TW');
    expect(pickLocale(null, 'zh-CN')).toBe('zh-CN');
    expect(pickLocale(null, 'fr-FR')).toBe('en');
  });

  it('ignores a stored value the app does not offer', () => {
    expect(pickLocale('ja', 'zh-CN')).toBe('zh-CN');
  });
});
