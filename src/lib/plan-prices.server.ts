import type { PlanPrice } from './plan-prices';

/** The API listens in the same container; INTERNAL_API_URL overrides it. */
const API = process.env.INTERNAL_API_URL || 'http://127.0.0.1:3457';

/** Prices for server rendering. The API caches Paddle's answer for 10 minutes. */
export async function fetchPlanPricesOnServer(): Promise<PlanPrice[] | null> {
  try {
    const res = await fetch(`${API}/api/billing/prices`, {
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { prices?: PlanPrice[] };
    return Array.isArray(body.prices) ? body.prices : null;
  } catch {
    return null;
  }
}
