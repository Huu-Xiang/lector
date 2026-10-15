/** Readfox tier names for the internal plan ids, which keep upstream's names. */
export const PLAN_NAMES = { free: 'Free', cloud: 'Plus', plus: 'Pro', max: 'Max' } as const;

export function planName(plan: string): string {
  return PLAN_NAMES[plan as keyof typeof PLAN_NAMES] ?? plan;
}
