import { isVocabReportAttemptId } from '../../languages/en/vocab-report';

export type PaidPlan = 'cloud' | 'plus' | 'max';

const SUBSCRIBE_PATH = '/subscribe';
export const VOCAB_REPORT_HISTORY_PATH = '/vocab-test/history';
const VOCAB_TEST_PATH = '/vocab-test';
const SAFE_ORIGIN = 'https://app.lector.invalid';
const ALLOWED_PARAMS = new Set(['plan', 'promo']);

/**
 * Paddle's grammar for a redeemable code: letters and numbers, 32 maximum.
 * api/src/lib/billing.ts holds the authoritative copy and is the only place
 * that maps a code to a discount. This one exists so a junk value never
 * survives into a stored `next` destination.
 */
const PROMO_PATTERN = /^[A-Z0-9]{1,32}$/;

function isPaidPlan(value: string | null): value is PaidPlan {
  return value === 'cloud' || value === 'plus' || value === 'max';
}

/** A code word normalised for a URL, or null when it could never be one. */
function normalizePromo(value: string | null): string | null {
  if (value === null) return null;
  const promo = value.trim().toUpperCase();
  return PROMO_PATTERN.test(promo) ? promo : null;
}

export function vocabReportReturnPath(attemptId: string): string {
  return `${VOCAB_TEST_PATH}?resume=report&draft=${attemptId}`;
}

function reportDraftId(params: URLSearchParams): string | null {
  const draft = params.get('draft');
  return params.getAll('resume').length === 1 &&
    params.get('resume') === 'report' &&
    params.getAll('draft').length === 1 &&
    Array.from(params.keys()).length === 2 &&
    isVocabReportAttemptId(draft)
    ? draft
    : null;
}

/** Read a report resume, including an error appended by email verification. */
export function vocabReportResumeFromSearch(search: string): {
  attemptId: string | null;
  callbackError: boolean;
} | null {
  const params = new URLSearchParams(search);
  if (!params.has('resume') && !params.has('draft')) return null;
  const callbackError = params.has('error');
  params.delete('error');
  return { attemptId: reportDraftId(params), callbackError };
}

export function readfoxBetaLoginPath(query: string): string | null {
  if (query.length > 4096) return null;
  const params = new URLSearchParams(query);
  if (params.getAll('sig').length !== 1 || !params.get('sig')) return null;
  const uri = params.get('redirect_uri');
  if (params.getAll('redirect_uri').length !== 1 || !uri) return null;
  try {
    const callback = new URL(uri);
    const local = callback.hostname === 'localhost' || callback.hostname === '127.0.0.1';
    if (
      (callback.protocol !== 'https:' && !(local && callback.protocol === 'http:')) ||
      callback.pathname !== '/api/auth/oauth2/callback/oidc' ||
      callback.username ||
      callback.password ||
      callback.search ||
      callback.hash
    )
      return null;
  } catch {
    return null;
  }
  return `/beta-login?${params.toString()}`;
}

/** Return a canonical allowlisted in-app destination after auth. */
export function sanitizeAuthReturnPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;

  let url: URL;
  try {
    url = new URL(value, SAFE_ORIGIN);
  } catch {
    return null;
  }

  if (url.origin !== SAFE_ORIGIN || url.hash !== '') return null;

  const params = url.searchParams;
  if (url.pathname === '/beta-login') return readfoxBetaLoginPath(params.toString());
  if (url.pathname === VOCAB_TEST_PATH) {
    const draft = reportDraftId(params);
    return draft ? vocabReportReturnPath(draft) : null;
  }
  if (url.pathname === VOCAB_REPORT_HISTORY_PATH && url.search === '') {
    return VOCAB_REPORT_HISTORY_PATH;
  }
  if (url.pathname !== SUBSCRIBE_PATH) return null;
  // An unrecognised parameter, or a repeated one, rejects the whole
  // destination. Silently dropping it would let a crafted link look preserved
  // while it quietly lost the reader's coupon.
  for (const key of params.keys()) {
    if (!ALLOWED_PARAMS.has(key)) return null;
    if (params.getAll(key).length > 1) return null;
  }

  const plan = params.get('plan');
  if (plan !== null && !isPaidPlan(plan)) return null;

  const rawPromo = params.get('promo');
  const promo = normalizePromo(rawPromo);
  if (rawPromo !== null && promo === null) return null;

  const canonical = new URLSearchParams();
  if (plan !== null) canonical.set('plan', plan);
  if (promo !== null) canonical.set('promo', promo);
  const query = canonical.toString();

  return query === '' ? SUBSCRIBE_PATH : `${SUBSCRIBE_PATH}?${query}`;
}

/** Read and validate `next` from an auth page's query string. */
export function authReturnPathFromSearch(search: string): string | null {
  return sanitizeAuthReturnPath(new URLSearchParams(search).get('next'));
}

/** Add a validated return destination to an auth route. */
export function authHref(route: string, returnPath: string | null | undefined): string {
  const safeReturnPath = sanitizeAuthReturnPath(returnPath);
  if (!safeReturnPath) return route;
  return `${route}?${new URLSearchParams({ next: safeReturnPath }).toString()}`;
}

/** Read a paid-plan selection on /subscribe. */
export function paidPlanFromSearch(search: string): PaidPlan | null {
  const plan = new URLSearchParams(search).get('plan');
  return isPaidPlan(plan) ? plan : null;
}

/**
 * Read a campaign code word on /subscribe. Normalised, so a link written in
 * lower case still resolves. The API decides whether it maps to a discount.
 */
export function promoFromSearch(search: string): string | null {
  return normalizePromo(new URLSearchParams(search).get('promo'));
}
