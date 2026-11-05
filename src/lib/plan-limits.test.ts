import { describe, expect, it } from 'vitest';
import {
  phraseSelectionLimitPayload,
  planLimitAction,
  planLimitWantsDialog,
  recommendedUpgrade,
  type PlanLimitPayload,
} from './plan-limits';

describe('plan-limit upgrade routing', () => {
  it('routes each tier one step up and lets Max use BYOK', () => {
    expect(recommendedUpgrade('free')).toBe('cloud');
    expect(recommendedUpgrade('cloud')).toBe('plus');
    expect(recommendedUpgrade('plus')).toBe('max');
    expect(recommendedUpgrade('max')).toBe('byok');
    expect(recommendedUpgrade('unlimited')).toBeNull();
  });

  it('does not upsell an account already paying with its own key', () => {
    expect(recommendedUpgrade('free', true)).toBeNull();
    expect(recommendedUpgrade('cloud', true)).toBeNull();
  });

  it('only exposes safe navigation targets', () => {
    expect(planLimitAction('cloud')).toEqual({
      label: 'upgradePlus',
      href: '/subscribe?plan=cloud',
    });
    expect(planLimitAction('plus')).toEqual({ label: 'seePlans', href: '/pricing' });
    expect(planLimitAction('max')).toEqual({ label: 'seePlans', href: '/pricing' });
    expect(planLimitAction('byok')).toEqual({ label: 'addKey', href: '/settings#byok' });
    expect(planLimitAction(null)).toBeNull();
    expect(planLimitAction('cloud', undefined, true)).toBeNull();
    expect(planLimitAction('plus', undefined, true)).toBeNull();
    expect(planLimitAction('max', undefined, true)).toBeNull();
    expect(planLimitAction('byok', 'wordGlossesPerMonth', true)).not.toBeNull();
  });

  it('offers BYOK only for AI-backed limits', () => {
    expect(planLimitAction('byok', 'wordGlossesPerMonth')).not.toBeNull();
    expect(planLimitAction('byok', 'ttsCharsPerMonth')).toBeNull();
  });

  it('opens the upgrade dialog only for Free accounts out of AI help', () => {
    const payload = (plan: string, metric: string): PlanLimitPayload => ({
      error: 'plan_limit',
      metric,
      limit: 1000,
      used: 1000,
      requested: 1,
      plan,
      upgrade: recommendedUpgrade(plan),
    });
    expect(planLimitWantsDialog(payload('free', 'wordGlossesPerMonth'))).toBe(true);
    expect(planLimitWantsDialog(payload('free', 'journalWordsPerMonth'))).toBe(false);
    expect(planLimitWantsDialog(payload('cloud', 'wordGlossesPerMonth'))).toBe(false);
  });

  it('preflights the Free six-word phrase boundary before a provider call', () => {
    const entitlements = {
      plan: 'free',
      byok: false,
      limits: { phraseSelectionWords: 6 },
    };

    expect(phraseSelectionLimitPayload(entitlements, 6)).toBeNull();
    expect(phraseSelectionLimitPayload(entitlements, 7)).toMatchObject({
      error: 'plan_limit',
      metric: 'phraseSelectionWords',
      limit: 6,
      requested: 7,
      plan: 'free',
      upgrade: 'cloud',
    });
  });
});
