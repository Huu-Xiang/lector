/**
 * Better Auth engine (#218): accounts, sessions, email verification, and
 * password reset, run in-process. Its tables (`user`, `session`, `account`,
 * `verification`, `twoFactor`) live in the same lector.db as user data so a
 * single replication stream covers both (#217). Only constructed, migrated,
 * and mounted in cloud proper (`config.authRequired`) — selfhost never
 * touches it. Session → userId: lib/session.ts; route-side reads: lib/user.ts.
 */
import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware, getOAuthState } from 'better-auth/api';
import { captcha, genericOAuth, twoFactor } from 'better-auth/plugins';
import { getMigrations } from 'better-auth/db/migration';
import { symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto';
import type { Database } from 'bun:sqlite';
import { config } from './config';
import { sendEmail } from './email';
import { passwordProblem, passwordProblemMessage } from './password-rules';
import { aliasDomains, canonicalEmail, isDisposableEmail } from './signup-email';
import { sendWelcomeEmail } from './lifecycle-email';
import { purgeTenantData } from './account-deletion';
import { getDatabaseInstance } from '../db';
import { attachInvite, inviteRequired, isAcceptableSignupCode } from './invites';
import { backfillWelcomeClaims } from './welcome-claims';
import { redeemSignupCode, rememberSignupCode } from './redeem';
import { shortenIp } from './ip-privacy';
import { parseSourceCookie } from './source-list';
import { recordSourceEvent } from './source-counts';
import { isSuspended } from './account-flags';
import { Sentry } from './sentry';
import {
  readfoxBetaClient,
  readfoxBetaProvider,
  validateReadfoxAuthOrigin,
} from './readfox-beta-auth';

/** Grants the sign-up plan, then starts the welcome mail without waiting for it. Neither step may fail the verification. */
export function runAfterEmailVerification(
  user: { id: string; email: string },
  steps = { redeem: redeemSignupCode, welcome: sendWelcomeEmail },
): void {
  try {
    steps.redeem(user.id, new Date(), user.email);
  } catch (err) {
    console.error('[accounts] failed to redeem sign-up code:', err);
    Sentry.captureException(err);
  }
  const reportWelcome = (err: unknown) => {
    console.error(`[accounts] failed to send welcome email to ${user.email}:`, err);
    Sentry.captureException(err);
  };
  try {
    steps.welcome(user.id).catch(reportWelcome);
  } catch (err) {
    reportWelcome(err);
  }
}

const SIGNUP_EMAIL_MESSAGES = {
  EMAIL_DISPOSABLE: 'Temporary email addresses cannot be used.',
  EMAIL_ALIAS_TAKEN: 'An account already uses this email address in another form.',
} as const;

type SignupEmailProblem = keyof typeof SIGNUP_EMAIL_MESSAGES;

/** One account per mailbox. A provider sign-up has a verified address, so only verified accounts hold an alias against it. */
export function signupEmailProblem(
  raw: unknown,
  database: Database,
  options: { verifiedOnly?: boolean } = {},
): SignupEmailProblem | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (isDisposableEmail(email)) return 'EMAIL_DISPOSABLE';
  const canonical = canonicalEmail(email);
  const lookup = database.prepare(
    `SELECT email FROM user WHERE email LIKE ?${options.verifiedOnly ? ' AND emailVerified = 1' : ''}`,
  );
  for (const domain of aliasDomains(email)) {
    for (const row of lookup.all(`%@${domain}`) as { email: string }[]) {
      const existing = row.email.toLowerCase();
      if (existing !== email && canonicalEmail(existing) === canonical) return 'EMAIL_ALIAS_TAKEN';
    }
  }
  return null;
}

function checkSignupEmail(raw: unknown, database: Database): void {
  const code = signupEmailProblem(raw, database);
  if (code) throw new APIError('BAD_REQUEST', { code, message: SIGNUP_EMAIL_MESSAGES[code] });
}

const GOOGLE_ISSUER = 'https://accounts.google.com';

/** True for Google's issuer origin or its pasted discovery URL. */
export function isGoogleIssuer(issuer: string): boolean {
  const value = issuer.trim().replace(/\/+$/, '').toLowerCase();
  return value === GOOGLE_ISSUER || value === `${GOOGLE_ISSUER}/.well-known/openid-configuration`;
}

/** Drops the password and sessions of an unverified account when a provider login links to it. */
function dropUnverifiedPassword(database: Database, userId: string): void {
  const row = database.prepare('SELECT emailVerified FROM user WHERE id = ?').get(userId) as
    | { emailVerified: number }
    | undefined;
  if (!row || row.emailVerified) return;
  database
    .prepare("DELETE FROM account WHERE userId = ? AND providerId = 'credential'")
    .run(userId);
  database.prepare('DELETE FROM session WHERE userId = ?').run(userId);
}

/** The social and generic OAuth callbacks are the only paths that create or verify a user without a password form. */
function isOAuthCallback(ctx: { path?: string } | null | undefined): boolean {
  return Boolean(ctx?.path?.includes('/callback/'));
}

function hasTwoFactor(database: Database, userId: string): boolean {
  const row = database.prepare('SELECT twoFactorEnabled FROM user WHERE id = ?').get(userId) as
    | { twoFactorEnabled: number | null }
    | undefined;
  return Boolean(row?.twoFactorEnabled);
}

/** Invite code that the login button stored in the OAuth state (`additionalData.inviteCode`). */
async function oauthInviteCode(): Promise<string> {
  const state = (await getOAuthState().catch(() => null)) as { inviteCode?: unknown } | null;
  return typeof state?.inviteCode === 'string' ? state.inviteCode.trim() : '';
}

export interface OidcOptions {
  /** Issuer origin (or a full discovery URL) — see oidcDiscoveryUrl(). */
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Defaults to the OIDC basics: openid profile email. */
  scopes?: string[];
}

export interface AuthEngineOptions {
  database: Database;
  /** Origin the auth endpoints are reached on, e.g. https://app.lector.dev */
  baseURL: string;
  /** Session-signing secret. Boot-guarded in cloud (assertBootableMode). */
  secret: string | undefined;
  /** Browser origins allowed to hit auth endpoints cross-origin (dev UI). */
  trustedOrigins: string[];
  github?: { clientId: string; clientSecret: string };
  /**
   * BYO OIDC (#218): any OpenID Connect provider — Authentik, Keycloak,
   * Auth0, Entra, … — via its discovery document. This is the multi-user
   * self-host SSO opt-in as much as a cloud feature: run cloud mode on your
   * own box and point these at your own IdP. Registered under the fixed
   * providerId 'oidc', so the redirect URI to allowlist on the IdP is
   * `<baseURL>/api/auth/oauth2/callback/oidc`.
   */
  oidc?: OidcOptions;
  betaIssuerLoginOrigin?: string;
  betaConsumer?: boolean;
  /**
   * Cloudflare Turnstile secret. When set, sign-up, sign-in, and
   * password-reset requests must carry an `x-captcha-response` token
   * (the plugin fails closed on a missing/invalid one). The matching site
   * key reaches the browser via window.__ENV__ (docker-entrypoint.sh).
   */
  turnstileSecretKey?: string;
}

/**
 * Accepts either an issuer origin (https://auth.example.com — with or
 * without a trailing slash) or a full discovery URL pasted straight from
 * IdP docs; both resolve to the discovery document.
 */
/** Endpoints that set a new password, and the body field that carries it. */
const PASSWORD_FIELDS: Record<string, string> = {
  '/sign-up/email': 'password',
  '/reset-password': 'newPassword',
  '/change-password': 'newPassword',
};

export function oidcDiscoveryUrl(issuer: string): string {
  if (issuer.includes('/.well-known/')) return issuer;
  return `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`;
}

/** Factory shared by the prod singleton and tests (in-memory DB aside). */
/** Seconds. The sign-up screen and the verification mail both say 3 days. */
export const VERIFICATION_LINK_SECONDS = 3 * 24 * 60 * 60;
/** Seconds without a visit before a sign-in ends. */
export const SESSION_SECONDS = 90 * 24 * 60 * 60;

export function createAuthEngine(opts: AuthEngineOptions) {
  const plugins: BetterAuthPlugin[] = [
    // TOTP two-factor auth (Google Authenticator et al), per-user opt-in from
    // Settings. Enrolment is verify-to-arm (skipVerificationOnEnable stays
    // false): `twoFactorEnabled` only flips after the first valid code, so a
    // user who closes the QR dialog early is never locked out. Email OTP is
    // deliberately not configured — TOTP + backup codes only.
    twoFactor({ issuer: 'Readfox' }),
  ];
  if (opts.turnstileSecretKey) {
    plugins.push(
      captcha({
        provider: 'cloudflare-turnstile',
        secretKey: opts.turnstileSecretKey,
        endpoints: [
          '/sign-up/email',
          '/sign-in/email',
          '/request-password-reset',
          '/send-verification-email',
        ],
      }),
    );
  }
  if (opts.betaIssuerLoginOrigin) {
    validateReadfoxAuthOrigin(opts.betaIssuerLoginOrigin);
    if (opts.betaIssuerLoginOrigin !== new URL(opts.baseURL).origin || opts.betaConsumer) {
      throw new Error('Readfox beta issuer must use its own site origin');
    }
    plugins.push(readfoxBetaProvider(opts.betaIssuerLoginOrigin, isSuspended));
  }
  if (
    opts.betaConsumer &&
    (opts.oidc?.clientId !== 'readfox-beta' || opts.oidc.clientSecret.length < 32)
  ) {
    throw new Error('Readfox beta consumer requires its own OAuth client configuration');
  }
  const isReadfoxBetaCallback = (
    ctx: { path?: string; params?: Record<string, unknown> } | null | undefined,
  ) =>
    opts.betaConsumer &&
    (ctx?.path === '/oauth2/callback/oidc' ||
      (ctx?.path === '/oauth2/callback/:providerId' && ctx.params?.providerId === 'oidc'));
  if (opts.oidc) {
    const { issuer, clientId, clientSecret } = opts.oidc;
    plugins.push(
      genericOAuth({
        config: [
          opts.betaConsumer
            ? readfoxBetaClient(issuer, clientId, clientSecret)
            : {
                providerId: 'oidc',
                discoveryUrl: oidcDiscoveryUrl(opts.oidc.issuer),
                clientId: opts.oidc.clientId,
                clientSecret: opts.oidc.clientSecret,
                scopes: opts.oidc.scopes ?? ['openid', 'profile', 'email'],
                pkce: true,
              },
        ],
      }),
    );
  }
  const mergesSameEmail = opts.oidc ? isGoogleIssuer(opts.oidc.issuer) : false;
  return betterAuth({
    database: opts.database,
    baseURL: opts.baseURL,
    basePath: '/api/auth',
    secret: opts.secret,
    trustedOrigins: opts.trustedOrigins,
    // The default error page lives on the API; a cancelled or refused provider login lands on /login.
    ...(opts.oidc ? { onAPIError: { errorURL: `${new URL(opts.baseURL).origin}/login` } } : {}),
    // A Google login with a verified email joins the account that has the same address, also
    // when that account never verified it; dropUnverifiedPassword then cuts the old password.
    account: {
      ...(opts.betaConsumer ? { updateAccountOnSignIn: false } : {}),
      accountLinking: {
        requireLocalEmailVerified: !mergesSameEmail,
        disableImplicitLinking: opts.betaConsumer,
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/sign-up/email') {
          if (
            inviteRequired() &&
            !isAcceptableSignupCode(ctx.headers?.get('x-invite-code') ?? '')
          ) {
            throw new APIError('FORBIDDEN', { message: 'invite_required' });
          }
          checkSignupEmail((ctx.body as Record<string, unknown> | undefined)?.email, opts.database);
        }
        const field = PASSWORD_FIELDS[ctx.path];
        if (!field) return;
        const problem = passwordProblem((ctx.body as Record<string, unknown> | undefined)?.[field]);
        if (problem)
          throw new APIError('BAD_REQUEST', { message: passwordProblemMessage(problem) });
      }),
      after: createAuthMiddleware(async (ctx) => {
        const code = ctx.headers?.get('x-invite-code');
        const user = (ctx.context.returned as { user?: { id?: string } } | undefined)?.user;
        if (ctx.path === '/sign-up/email' && user?.id) {
          // The count has no link to the new account: only the cookie's source and language.
          try {
            const first = parseSourceCookie(ctx.headers?.get('cookie'));
            if (first) recordSourceEvent('signup', first[0], first[1]);
          } catch (err) {
            console.error('[accounts] failed to count the sign-up source:', err);
          }
        }
        if (ctx.path !== '/sign-up/email' || !code || !user?.id) return;
        try {
          attachInvite({ inviteeId: user.id, rawCode: code });
          rememberSignupCode(user.id, code);
        } catch (err) {
          console.error('[accounts] failed to record invite:', err);
        }
      }),
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      onPasswordReset: async ({ user }) => {
        getDatabaseInstance().prepare('DELETE FROM api_tokens WHERE userId = ?').run(user.id);
      },
      sendResetPassword: async ({ user, url }) => {
        try {
          await sendEmail({
            to: user.email,
            subject: 'Reset your Readfox password',
            text:
              `Someone (hopefully you) asked to reset the password for ${user.email}.\n\n` +
              `Reset it here: ${url}\n\n` +
              `If this wasn't you, ignore this email — the link expires in an hour.`,
          });
        } catch (err) {
          // A transport failure must be loud in logs, not a 500 on the flow.
          console.error(`[accounts] failed to send password reset to ${user.email}:`, err);
        }
      },
    },
    session: { expiresIn: SESSION_SECONDS },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: VERIFICATION_LINK_SECONDS,
      sendVerificationEmail: async ({ user, url }) => {
        try {
          await sendEmail({
            to: user.email,
            subject: 'Verify your Readfox email address',
            text:
              `Welcome to Readfox. Confirm your email address to activate your account:\n\n` +
              `${url}\n\n` +
              `The link works for 3 days. If you didn't sign up, ignore this email.`,
          });
        } catch (err) {
          console.error(`[accounts] failed to send verification email to ${user.email}:`, err);
        }
      },
      afterEmailVerification: async (user) => runAfterEmailVerification(user),
    },
    databaseHooks: {
      // Login records keep a shortened address (lib/ip-privacy.ts). Rate limiting
      // reads the live request address, never this column.
      session: {
        create: {
          before: async (session, ctx) => {
            // The two-factor plugin challenges password sign-in only.
            if (isOAuthCallback(ctx) && hasTwoFactor(opts.database, session.userId)) return false;
            return {
              data: { ipAddress: shortenIp((session as { ipAddress?: string | null }).ipAddress) },
            };
          },
        },
        update: {
          before: async (session) =>
            typeof session.ipAddress === 'string'
              ? { data: { ipAddress: shortenIp(session.ipAddress) } }
              : undefined,
        },
      },
      account: {
        create: {
          before: async (account) => {
            if (account.providerId !== 'credential') {
              dropUnverifiedPassword(opts.database, account.userId);
            }
            if (opts.betaConsumer && account.providerId === 'oidc') {
              return { data: { accessToken: null, refreshToken: null, idToken: null } };
            }
          },
        },
      },
      user: {
        create: {
          before: async (user, ctx) => {
            if (!isOAuthCallback(ctx)) return;
            if (
              !isReadfoxBetaCallback(ctx) &&
              inviteRequired() &&
              !isAcceptableSignupCode(await oauthInviteCode())
            ) {
              throw new APIError('FORBIDDEN', { message: 'invite_required' });
            }
            const problem = signupEmailProblem(user.email, opts.database, { verifiedOnly: true });
            if (problem) {
              throw new APIError('BAD_REQUEST', { code: problem, message: problem.toLowerCase() });
            }
          },
          after: async (user, ctx) => {
            if (isOAuthCallback(ctx)) {
              try {
                const first = parseSourceCookie(
                  ctx?.headers?.get('cookie') ?? ctx?.request?.headers.get('cookie'),
                );
                if (first) recordSourceEvent('signup', first[0], first[1]);
                const code = await oauthInviteCode();
                if (code) {
                  attachInvite({ inviteeId: user.id, rawCode: code });
                  rememberSignupCode(user.id, code);
                }
              } catch (err) {
                console.error('[accounts] failed to record the provider sign-up:', err);
              }
            }
            if (user.emailVerified) runAfterEmailVerification(user);
          },
        },
        update: {
          // Inside a provider callback, a verified flag set on an existing account is the first verification.
          after: async (user, ctx) => {
            if (user?.emailVerified && isOAuthCallback(ctx)) runAfterEmailVerification(user);
          },
        },
      },
    },
    user: {
      // Right-to-erasure (#227). Deletion is confirmed out-of-band by an emailed
      // link (sendDeleteAccountVerification) — the same rail as signup
      // verification and password reset — so it works for password AND
      // OAuth/OIDC accounts alike, where there's no password to re-challenge.
      // beforeDelete wipes the tenant's own data (account-deletion.ts) in the
      // same request that removes the Better Auth identity; running it BEFORE
      // deletion means a purge failure aborts the whole thing — the account
      // stays intact and retryable rather than becoming a half-erased orphan.
      deleteUser: {
        enabled: true,
        sendDeleteAccountVerification: async ({ user, url }) => {
          try {
            await sendEmail({
              to: user.email,
              subject: 'Confirm your Readfox account deletion',
              text:
                `You asked to permanently delete your Readfox account (${user.email}) and all of its data.\n\n` +
                `This cannot be undone. Confirm the deletion here:\n${url}\n\n` +
                `If this wasn't you, do NOT click the link — change your password instead, as someone may have access to your session. This link expires in 24 hours.`,
            });
          } catch (err) {
            console.error(
              `[accounts] failed to send delete-account verification to ${user.email}:`,
              err,
            );
          }
        },
        beforeDelete: async (user) => {
          purgeTenantData(user.id, user.email);
        },
      },
    },
    socialProviders: opts.github ? { github: opts.github } : {},
    plugins,
  });
}

export type AuthEngine = ReturnType<typeof createAuthEngine>;

export async function provisionReadfoxBetaClient(
  engine: AuthEngine,
  betaOrigin: string,
  secret: string,
) {
  const origin = validateReadfoxAuthOrigin(betaOrigin);
  if (secret.length < 32) throw new Error('Readfox beta client secret is too short');

  const { adapter, secretConfig } = await engine.$context;
  const where = [{ field: 'clientId', value: 'readfox-beta' }];
  const redirectUris = [new URL('/api/auth/oauth2/callback/oidc', origin).href];
  const existing = await adapter.findOne<{ clientSecret: string; redirectUris: string[] }>({
    model: 'oauthClient',
    where,
  });
  if (
    existing &&
    existing.redirectUris.length === 1 &&
    existing.redirectUris[0] === redirectUris[0] &&
    (await symmetricDecrypt({ key: secretConfig, data: existing.clientSecret })) === secret
  )
    return;

  const client = {
    clientId: 'readfox-beta',
    name: 'Readfox Beta',
    clientSecret: await symmetricEncrypt({ key: secretConfig, data: secret }),
    redirectUris,
    scopes: ['openid', 'profile', 'email'],
    grantTypes: ['authorization_code'],
    responseTypes: ['code'],
    tokenEndpointAuthMethod: 'client_secret_basic',
    requirePKCE: true,
    skipConsent: true,
    public: false,
    type: 'web',
    updatedAt: new Date(),
  };
  if (existing) await adapter.update({ model: 'oauthClient', where, update: client });
  else await adapter.create({ model: 'oauthClient', data: { ...client, createdAt: new Date() } });
}

/**
 * Create/extend Better Auth's tables, idempotently. Runs at boot in cloud
 * mode (index.ts) — same self-migrating posture as db.ts.
 */
export async function runAuthMigrations(engine: AuthEngine): Promise<void> {
  const { runMigrations } = await getMigrations(engine.options);
  await runMigrations();
  backfillWelcomeClaims(getDatabaseInstance());
}

/**
 * Browser origins trusted for credentialed requests in cloud mode. Prod is
 * same-origin path-split (deploy/cloud/), so this mostly serves cross-origin
 * dev: UI on :3456/:3000 → API on :3457.
 */
export function resolveTrustedOrigins(): string[] {
  const fromEnv = (process.env.LECTOR_TRUSTED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromEnv.length > 0) return fromEnv;
  return ['http://localhost:3456', 'http://localhost:3000'];
}

function githubFromEnv(): AuthEngineOptions['github'] {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

/**
 * BYO OIDC env (#218): OIDC_ISSUER + OIDC_CLIENT_ID + OIDC_CLIENT_SECRET
 * activate it (all three, else off — a partial set is warned about since
 * it's almost certainly a deploy typo, unlike the deliberate keyless
 * default). OIDC_SCOPES optionally overrides the requested scopes
 * (space- or comma-separated).
 */
function oidcFromEnv(): AuthEngineOptions['oidc'] {
  const issuer = process.env.OIDC_ISSUER;
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = process.env.OIDC_CLIENT_SECRET;
  const set = [issuer, clientId, clientSecret].filter(Boolean).length;
  if (set === 0) return undefined;
  if (!issuer || !clientId || !clientSecret) {
    console.warn(
      '[accounts] OIDC env is partially set — need OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET; BYO OIDC stays off',
    );
    return undefined;
  }
  const scopes = (process.env.OIDC_SCOPES || '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return { issuer, clientId, clientSecret, scopes: scopes.length > 0 ? scopes : undefined };
}

let _engine: AuthEngine | null = null;

/** The prod engine, lazily built from env — never called in selfhost mode. */
export function getAuthEngine(): AuthEngine {
  if (_engine) return _engine;
  const port = process.env.PORT || '3457';
  _engine = createAuthEngine({
    database: getDatabaseInstance(),
    baseURL: process.env.BETTER_AUTH_URL || `http://localhost:${port}`,
    secret: config.authSecret,
    trustedOrigins: resolveTrustedOrigins(),
    github: githubFromEnv(),
    oidc: oidcFromEnv(),
    betaIssuerLoginOrigin: process.env.READFOX_BETA_ISSUER_LOGIN_ORIGIN,
    betaConsumer: process.env.READFOX_BETA_CONSUMER === '1',
    turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY || undefined,
  });
  return _engine;
}
