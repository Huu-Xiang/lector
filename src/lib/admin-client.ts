/**
 * Client data layer for the admin dashboard (#221). Thin wrappers over the
 * /api/admin endpoints (server-enforced by requireAdmin). A non-admin never
 * reaches these — the nav link is hidden and the page renders "not authorized"
 * on a 403.
 */
import { apiFetch } from './api-base';

export interface AdminUserLanguage {
  code: string;
  name: string;
  flag: string;
  target: boolean;
  enabled: boolean;
  lessons: number;
  vocab: number;
  knownWords: number;
  wordsRead: number;
}

export interface AdminLanguageStat {
  code: string;
  name: string;
  flag: string;
  optedIn: number;
  contentUsers: number;
  targetUsers: number;
  lessons: number;
  vocab: number;
  knownWords: number;
  wordsRead: number;
}

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  createdAt: string | null;
  plan: 'free' | 'cloud' | 'plus' | 'max' | null;
  status: string;
  entitled: boolean;
  compedPlan: 'cloud' | 'plus' | 'max' | null;
  grant: { plan: 'cloud' | 'plus' | 'max'; endsAt: string } | null;
  currentPeriodEnd: string | null;
  suspended: boolean;
  suspendedReason: string | null;
  lastActiveAt: string | null;
  library: {
    collections: number;
    lessons: number;
    vocab: number;
    knownWords: number;
    storageBytes: number;
  };
  languages?: AdminUserLanguage[];
  usage: {
    period: string;
    dayPeriod: string;
    llmRequests: number;
    ttsChars: number;
    journalWords: number;
    wordGlossesPerMonth: number;
    phraseTranslationsPerDay: number;
    contextTranslationsPerDay: number;
    tracked: boolean;
  };
}

export interface AdminSummary {
  users: number;
  verified: number;
  subscribers: number;
  freeAccounts: number;
  suspended: number;
  byPlan: Record<string, number>;
  byStatus: Record<string, number>;
  period: string;
  dayPeriod: string;
  usageTotals: {
    llmRequests: number;
    ttsChars: number;
    journalWords: number;
    wordGlossesPerMonth: number;
    phraseTranslationsPerDay: number;
    contextTranslationsPerDay: number;
  };
  freeUsageTotals: {
    wordGlossesPerMonth: number;
    phraseTranslationsPerDay: number;
    contextTranslationsPerDay: number;
  };
  usageTracked: boolean;
  billingResyncAvailable: boolean;
  languages?: AdminLanguageStat[];
  activeLast7Days?: number;
  activeLast30Days?: number;
  withLibrary?: number;
  onboarding?: {
    completed: number;
    inProgress: number;
    skipped: number;
  };
}

/** True if the caller is an admin (200 from the gated probe), false on 403/404. */
export async function checkAdminAccess(): Promise<boolean> {
  const res = await apiFetch('/api/admin/access');
  return res.ok;
}

export async function getAdminSummary(): Promise<AdminSummary> {
  const res = await apiFetch('/api/admin/summary');
  if (!res.ok) throw new Error(`admin summary failed (${res.status})`);
  return res.json();
}

export async function getAdminUsers(): Promise<AdminUserRow[]> {
  const res = await apiFetch('/api/admin/users');
  if (!res.ok) throw new Error(`admin users failed (${res.status})`);
  return (await res.json()).users as AdminUserRow[];
}

/** The account id for an exact email address, or null. A partial address finds nothing. */
export async function findUserByEmail(email: string): Promise<string | null> {
  const res = await apiFetch(`/api/admin/users/find?email=${encodeURIComponent(email)}`);
  if (!res.ok) throw new Error(`admin find failed (${res.status})`);
  return ((await res.json()) as { id: string | null }).id;
}

/** The full email address of one account. The server writes an audit entry. */
export async function revealEmail(id: string): Promise<string> {
  const res = await apiFetch(`/api/admin/users/${id}/reveal-email`, { method: 'POST' });
  if (!res.ok) throw new Error(`reveal failed (${res.status})`);
  return ((await res.json()) as { email: string }).email;
}

export async function suspendUser(id: string, reason: string): Promise<void> {
  const res = await apiFetch(`/api/admin/users/${id}/suspend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `suspend failed (${res.status})`);
  }
}

export async function restoreUser(id: string): Promise<void> {
  const res = await apiFetch(`/api/admin/users/${id}/restore`, { method: 'POST' });
  if (!res.ok) throw new Error(`restore failed (${res.status})`);
}

/** Grant a complimentary membership at a tier — the account bypasses the
 *  subscription gate and (once #222 lands) gets that plan's limits/models. */
export async function compUser(
  id: string,
  plan: 'cloud' | 'plus' | 'max',
  reason: string,
): Promise<void> {
  const res = await apiFetch(`/api/admin/users/${id}/comp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan, reason }),
  });
  if (!res.ok) throw new Error(`comp failed (${res.status})`);
}

/** Revoke complimentary access — the account is billed normally again. */
export async function uncompUser(id: string): Promise<void> {
  const res = await apiFetch(`/api/admin/users/${id}/uncomp`, { method: 'POST' });
  if (!res.ok) throw new Error(`uncomp failed (${res.status})`);
}

export async function endGrants(id: string): Promise<void> {
  const res = await apiFetch(`/api/admin/users/${id}/end-grants`, { method: 'POST' });
  if (!res.ok) throw new Error(`end plan failed (${res.status})`);
}

async function action(id: string, verb: string, label: string): Promise<void> {
  const res = await apiFetch(`/api/admin/users/${id}/${verb}`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `${label} failed (${res.status})`);
  }
}

/** Clear the account's two-factor auth so it can re-enrol. */
export const resetMfa = (id: string) => action(id, 'reset-mfa', 'MFA reset');
/** Send the account a password-reset email. */
export const sendPasswordReset = (id: string) => action(id, 'password-reset', 'Password reset');
/** Re-send the verification email to an unverified account. */
export const resendVerification = (id: string) =>
  action(id, 'resend-verification', 'Resend verification');
/** Force-mark the account's email verified. */
export const forceVerify = (id: string) => action(id, 'verify', 'Verify');
/** Sign the account out of every session. */
export const revokeSessions = (id: string) => action(id, 'revoke-sessions', 'Revoke sessions');
/** Reconcile the local billing mirror with Paddle's current account state. */
export const resyncPaddle = (id: string) => action(id, 'resync-paddle', 'Paddle resync');

export interface AdminAuditEntry {
  id: number;
  actorEmail: string | null;
  action: string;
  targetEmail: string | null;
  detail: string | null;
  createdAt: string;
}

export async function getAuditLog(): Promise<AdminAuditEntry[]> {
  const res = await apiFetch('/api/admin/audit');
  if (!res.ok) throw new Error(`audit log failed (${res.status})`);
  return (await res.json()).entries as AdminAuditEntry[];
}

export interface ImpersonationStatus {
  active: boolean;
  targetUserId?: string;
  targetEmail?: string | null;
  expiresAt?: string;
}

/** Begin a read-only "view as" session for a user (#320). Returns the grant's expiry. */
export async function startImpersonation(
  id: string,
): Promise<{ targetUserId: string; targetEmail: string | null; expiresAt: string }> {
  const res = await apiFetch(`/api/admin/users/${id}/impersonate`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `impersonate failed (${res.status})`);
  }
  return res.json();
}

/** End the operator's active impersonation session. */
export async function stopImpersonation(): Promise<void> {
  const res = await apiFetch('/api/admin/impersonation/stop', { method: 'POST' });
  if (!res.ok) throw new Error(`stop impersonation failed (${res.status})`);
}

/** The caller's active impersonation, or { active: false }. Un-gated: safe for
 *  any signed-in user to call (non-admins simply have no grant). */
export async function getImpersonationStatus(): Promise<ImpersonationStatus> {
  const res = await apiFetch('/api/impersonation/status');
  if (!res.ok) return { active: false };
  return res.json();
}

/** Fetch a user's full export and trigger a JSON file download in the browser. */
export async function exportUser(id: string, email: string): Promise<void> {
  const res = await apiFetch(`/api/admin/users/${id}/export`);
  if (!res.ok) throw new Error(`export failed (${res.status})`);
  const data = await res.json();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = `readfox-export-${email.replace(/[^a-z0-9]+/gi, '-')}-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface RedeemCampaignRow {
  id: string;
  name: string;
  plan: 'cloud' | 'plus' | 'max';
  days: number;
  perUserLimit: number;
  totalLimit: number | null;
  expiresAt: string | null;
  active: number;
  createdAt: string;
  codes: number;
  uses: number;
}

export async function getRedeemCampaigns(): Promise<RedeemCampaignRow[]> {
  const res = await apiFetch('/api/admin/redeem/campaigns');
  if (!res.ok) throw new Error(`campaigns failed (${res.status})`);
  return ((await res.json()) as { campaigns: RedeemCampaignRow[] }).campaigns;
}

export async function createRedeemCampaign(input: {
  name: string;
  plan: 'cloud' | 'plus' | 'max';
  days: number;
  perUserLimit: number;
  totalLimit: number | null;
  expiresAt: string | null;
  mode: 'shared' | 'batch';
  code?: string;
  count?: number;
  prefix?: string;
}): Promise<string[]> {
  const res = await apiFetch('/api/admin/redeem/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `create failed (${res.status})`);
  return (body as { codes: string[] }).codes;
}

export async function getRedeemCodes(id: string): Promise<Array<{ code: string; uses: number }>> {
  const res = await apiFetch(`/api/admin/redeem/campaigns/${id}/codes`);
  if (!res.ok) throw new Error(`codes failed (${res.status})`);
  return ((await res.json()) as { codes: Array<{ code: string; uses: number }> }).codes;
}

export async function setRedeemCampaignActive(id: string, active: boolean): Promise<void> {
  const res = await apiFetch(`/api/admin/redeem/campaigns/${id}/active`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
  });
  if (!res.ok) throw new Error(`update failed (${res.status})`);
}

export interface RefundRequestRow {
  id: string;
  outTradeNo: string;
  userId: string;
  email: string | null;
  plan: 'cloud' | 'plus' | 'max';
  amountFen: number;
  channel: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  usedPercent: number;
  createdAt: string;
  decidedAt: string | null;
}

export async function getRefundRequests(): Promise<RefundRequestRow[]> {
  const res = await apiFetch('/api/admin/refund-requests');
  if (!res.ok) throw new Error(`refund requests failed (${res.status})`);
  return ((await res.json()) as { requests: RefundRequestRow[] }).requests;
}

export async function decideRefundRequest(id: string, approve: boolean): Promise<void> {
  const res = await apiFetch(`/api/admin/refund-requests/${id}/${approve ? 'approve' : 'reject'}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`refund decision failed (${res.status})`);
}

export type AdminTrendRange = 7 | 30 | 90;

export interface AdminTrendDay {
  date: string;
  signups: number;
  active: number;
  lookups: number;
  wordsSaved: number;
  practiced: number;
  minutesRead: number;
  freePhraseTranslations: number;
  freeContextTranslations: number;
  rmbOrders: number;
  rmbFen: number;
}

export interface AdminTrends {
  range: AdminTrendRange;
  from: string;
  to: string;
  excludedAccounts: number;
  daily: AdminTrendDay[];
  funnel: {
    signedUp: number;
    verified: number;
    finishedSetup: number;
    studied: number;
    finishedOnboarding: number;
    cameBack: number;
  };
  retention: {
    nextDay: { eligible: number; returned: number };
    afterWeek: { eligible: number; returned: number };
  };
  rmb: { orders: number; fen: number; refundedOrders: number; refundedFen: number };
}

export async function getAdminTrends(days: AdminTrendRange): Promise<AdminTrends> {
  const res = await apiFetch(`/api/admin/trends?days=${days}`);
  if (!res.ok) throw new Error(`admin trends failed (${res.status})`);
  return res.json();
}
