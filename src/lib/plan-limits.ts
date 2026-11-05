/**
 * Client half of the plan-limits engine (#222): turn the API's 429
 * `plan_limit` responses into a soft upsell prompt instead of an error wall,
 * and let surfaces reflect limits before calling the API. Enforcement is
 * server-side only — everything here is UX.
 */

export interface PlanLimitPayload {
  error: 'plan_limit';
  metric: string;
  limit: number;
  used: number;
  requested: number;
  plan: string;
  upgrade: PlanUpgradeTarget;
}

export type PlanUpgradeTarget = 'cloud' | 'plus' | 'max' | 'byok' | null;

export function recommendedUpgrade(plan: string, byok = false): PlanUpgradeTarget {
  if (byok) return null;
  if (plan === 'free') return 'cloud';
  if (plan === 'cloud') return 'plus';
  if (plan === 'plus') return 'max';
  if (plan === 'max') return 'byok';
  return null;
}

export function phraseSelectionLimitPayload(
  entitlements: {
    plan: string;
    byok: boolean;
    limits: Record<string, number | null>;
  },
  requestedWords: number,
): PlanLimitPayload | null {
  const limit = entitlements.limits.phraseSelectionWords;
  if (typeof limit !== 'number' || requestedWords <= limit) return null;
  return {
    error: 'plan_limit',
    metric: 'phraseSelectionWords',
    limit,
    used: 0,
    requested: requestedWords,
    plan: entitlements.plan,
    upgrade: recommendedUpgrade(entitlements.plan, entitlements.byok),
  };
}

/** Where the prompt's button goes; Free buys Plus, other tiers only see the plans. */
export function planLimitAction(
  upgrade: PlanUpgradeTarget,
  metric?: string,
  inApp = false,
): { label: 'upgradePlus' | 'seePlans' | 'addKey'; href: string } | null {
  if (inApp && (upgrade === 'cloud' || upgrade === 'plus' || upgrade === 'max')) return null;
  if (upgrade === 'cloud') return { label: 'upgradePlus', href: '/subscribe?plan=cloud' };
  if (upgrade === 'plus' || upgrade === 'max') return { label: 'seePlans', href: '/pricing' };
  if (upgrade === 'byok' && (!metric || AI_METRICS.has(metric))) {
    return { label: 'addKey', href: '/settings#byok' };
  }
  return null;
}

export const AI_METRICS = new Set([
  'phraseSelectionWords',
  'llmRequestsPerMonth',
  'wordGlossesPerMonth',
  'phraseTranslationsPerDay',
  'contextTranslationsPerDay',
]);

/** Metrics with their own text in `planLimits.metrics`; the rest use `generic`. */
export const NAMED_METRICS = new Set([
  ...AI_METRICS,
  'journalWordsPerMonth',
  'ttsCharsPerMonth',
  'maxCollections',
  'maxLessons',
  'maxVocabEntries',
]);

/** A Free account that ran out of AI help gets a dialog; everything else a toast. */
export function planLimitWantsDialog(payload: PlanLimitPayload): boolean {
  return payload.plan === 'free' && AI_METRICS.has(payload.metric);
}

export const PLAN_LIMIT_EVENT = 'readfox:plan-limit';

// One prompt per few seconds, app-wide: a burst of limited calls (e.g. a
// failing import loop) must not stack prompts.
let lastPromptAt = 0;

/** Hands the payload to PlanLimitPrompt, which owns the translated text. */
export function showPlanLimitToast(payload: PlanLimitPayload): void {
  const now = Date.now();
  if (now - lastPromptAt < 5000) return;
  lastPromptAt = now;
  window.dispatchEvent(new CustomEvent<PlanLimitPayload>(PLAN_LIMIT_EVENT, { detail: payload }));
}

/**
 * Inspect a 429 response; when it is a plan_limit, show the upsell prompt.
 * Reads a clone so callers can still consume the body. Fire-and-forget.
 */
export function interceptPlanLimit(res: Response): void {
  if (res.status !== 429) return;
  res
    .clone()
    .json()
    .then((body: unknown) => {
      if (body && typeof body === 'object' && (body as { error?: string }).error === 'plan_limit') {
        showPlanLimitToast(body as PlanLimitPayload);
      }
    })
    .catch(() => {
      /* non-JSON 429 — not ours */
    });
}
