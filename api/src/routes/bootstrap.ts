import { Hono } from 'hono';
import { db, type SettingRow } from '../db';
import { isBillingExempt, isSuspended } from '../lib/account-flags';
import {
  billingConfig,
  getUserEmail,
  isEntitledStatus,
  resolveBillingStatus,
} from '../lib/billing';
import { config, type LectorMode } from '../lib/config';
import { resolveUserId } from '../lib/user';

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
  mode: LectorMode;
  user: BootstrapUser | null;
  billing: BootstrapBilling;
  targetLanguage: string | null;
}

export interface BootstrapRouteDeps {
  mode?: LectorMode;
  authRequired?: boolean;
  billingEnforced?: boolean;
  freeTierEnabled?: boolean;
  exemptEmails?: ReadonlySet<string>;
  checkSuspended?: (userId: string) => boolean;
  checkBillingExempt?: (userId: string) => boolean;
  resolveEmail?: (userId: string) => string | null;
  resolveBillingStatus?: (userId: string, email: string | null) => string | null;
  readUser?: (userId: string) => BootstrapUser | null;
  readTargetLanguage?: (userId: string) => string | null;
}

function defaultReadUser(userId: string): BootstrapUser | null {
  try {
    const row = db.prepare('SELECT id, email, name FROM user WHERE id = ?').get(userId) as
      | { id: string; email?: string | null; name?: string | null }
      | undefined;
    if (!row) return { id: userId, email: null, name: null };
    return {
      id: row.id,
      email: row.email ?? null,
      name: row.name ?? null,
    };
  } catch {
    return { id: userId, email: null, name: null };
  }
}

function defaultReadTargetLanguage(userId: string): string | null {
  const row = db
    .prepare("SELECT value FROM settings WHERE userId = ? AND key = 'targetLanguage'")
    .get(userId) as SettingRow | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value);
    return typeof parsed === 'string' && parsed.length > 0 ? parsed : null;
  } catch {
    return typeof row.value === 'string' && row.value.length > 0 ? row.value : null;
  }
}

export function makeBootstrapRoutes(deps: BootstrapRouteDeps = {}) {
  const app = new Hono();
  const mode = deps.mode ?? config.mode;
  const authRequired = deps.authRequired ?? config.authRequired;
  const billingEnforced = deps.billingEnforced ?? billingConfig.enforced;
  const freeTierEnabled = deps.freeTierEnabled ?? billingConfig.freeTierEnabled;
  const exemptEmails = deps.exemptEmails ?? billingConfig.exemptEmails;
  const checkSuspended = deps.checkSuspended ?? isSuspended;
  const checkBillingExempt = deps.checkBillingExempt ?? isBillingExempt;
  const resolveEmail = deps.resolveEmail ?? getUserEmail;
  const resolveStatus = deps.resolveBillingStatus ?? resolveBillingStatus;
  const readUser = deps.readUser ?? defaultReadUser;
  const readTargetLanguage = deps.readTargetLanguage ?? defaultReadTargetLanguage;

  app.get('/', (c) => {
    c.header('Cache-Control', 'private, no-store');
    c.header('Vary', 'Cookie');

    const userId = resolveUserId(authRequired, c);
    const targetLanguage = readTargetLanguage(userId);

    if (!authRequired) {
      const payload: BootstrapPayload = {
        mode,
        user: null,
        billing: {
          enforced: false,
          accessAllowed: true,
          status: mode === 'selfhost' ? 'selfhost' : 'none',
          suspended: false,
        },
        targetLanguage,
      };
      return c.json(payload);
    }

    const user = readUser(userId);
    const suspended = checkSuspended(userId);

    if (!billingEnforced) {
      const payload: BootstrapPayload = {
        mode,
        user,
        billing: {
          enforced: false,
          accessAllowed: !suspended,
          status: 'none',
          suspended,
        },
        targetLanguage,
      };
      return c.json(payload);
    }

    const email = user?.email ?? resolveEmail(userId);
    const exempt =
      (email !== null && exemptEmails.has(email.toLowerCase())) || checkBillingExempt(userId);
    const status = resolveStatus(userId, email);
    const subscriptionActive = isEntitledStatus(status);
    const accessAllowed = !suspended && (freeTierEnabled || subscriptionActive || exempt);

    const payload: BootstrapPayload = {
      mode,
      user,
      billing: {
        enforced: true,
        accessAllowed,
        status: status ?? 'none',
        suspended,
      },
      targetLanguage,
    };
    return c.json(payload);
  });

  return app;
}

export default makeBootstrapRoutes();
