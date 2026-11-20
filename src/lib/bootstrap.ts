import { apiFetch } from './api-base';

export interface BootstrapUser {
  id: string;
  email: string | null;
  name: string | null;
}

export interface BootstrapBilling {
  enforced: boolean;
  accessAllowed: boolean;
  status: string;
  suspended: boolean;
}

export interface BootstrapPayload {
  mode: 'selfhost' | 'cloud';
  user: BootstrapUser | null;
  billing: BootstrapBilling;
  targetLanguage: string | null;
}

export type BootstrapResult = { ok: true; data: BootstrapPayload } | { ok: false; status: number };

let cachedResult: BootstrapResult | null = null;
let inflight: Promise<BootstrapResult> | null = null;

/** Synchronous read of a previously resolved bootstrap payload, if available. */
export function peekBootstrap(): BootstrapPayload | null {
  return cachedResult?.ok ? cachedResult.data : null;
}

/** Clear cached/in-flight bootstrap state (call on sign-out, retry, or tests). */
export function resetBootstrapCache(): void {
  cachedResult = null;
  inflight = null;
}

/**
 * Fetch `/api/bootstrap` once and share the result across AuthGuard,
 * BillingGuard, and SetupGuard so cold loads pay a single network round-trip
 * instead of three sequential guard probes.
 */
export function fetchBootstrap(fetcher: typeof apiFetch = apiFetch): Promise<BootstrapResult> {
  if (cachedResult?.ok) return Promise.resolve(cachedResult);
  if (inflight) return inflight;

  inflight = (async (): Promise<BootstrapResult> => {
    try {
      const res = await fetcher('/api/bootstrap');
      if (!res.ok) {
        return { ok: false, status: res.status };
      }
      const data = (await res.json()) as BootstrapPayload;
      const result: BootstrapResult = { ok: true, data };
      cachedResult = result;
      return result;
    } catch {
      return { ok: false, status: 0 };
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
