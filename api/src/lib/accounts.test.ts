/**
 * Accounts & sessions (#218), exercised over HTTP against a composed app —
 * the same engine factory, session middleware, PAT middleware, and identity
 * seam cloud runs. The auth engine lives on an in-memory DB; PAT rows go
 * through the regular test DB (api_tokens). Row-level tenancy stays the
 * user-scoping ratchet's job (routes/user-scoping.test.ts); this suite pins
 * the credential layer that feeds it a userId.
 */
import { describe, test, expect, beforeAll, afterAll, afterEach } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { Database } from 'bun:sqlite';
import { randomBytes, randomUUID } from 'crypto';
import { db } from '../db';
import {
  createAuthEngine,
  isGoogleIssuer,
  oidcDiscoveryUrl,
  runAfterEmailVerification,
  runAuthMigrations,
  type AuthEngine,
} from './accounts';
import { makePatMiddleware } from './auth';
import { hashToken } from './crypto';
import { makeSessionMiddleware } from './session';
import { resolveUserId, LOCAL_USER_ID } from './user';
import { setEmailTransport, type EmailMessage } from './email';
import { getOrCreateInviteCode } from './invites';
import { activeGrant } from './plan-grants';
import { createCampaign } from './redeem';
import { WELCOME_CODE } from './welcome-offer';

const BASE = 'http://localhost:9999';

/** Mint a PAT row directly (the tokens ROUTE is config-bound to selfhost in
 * tests — its tenancy is pinned in routes/user-scoping.test.ts). */
function insertPat(userId: string, scopes: string[] = ['*']): string {
  const token = `ltr_${randomBytes(32).toString('base64url')}`;
  db.prepare(
    `INSERT INTO api_tokens (id, name, tokenHash, scopes, createdAt, userId)
     VALUES (?, 'accounts-test-pat', ?, ?, ?, ?)`,
  ).run(randomUUID(), hashToken(token), JSON.stringify(scopes), new Date().toISOString(), userId);
  return token;
}

const emails: EmailMessage[] = [];
let engine: AuthEngine;
let app: Hono;

function lastEmailMatching(subject: RegExp): EmailMessage {
  const found = [...emails].reverse().find((e) => subject.test(e.subject));
  if (!found) throw new Error(`no captured email matching ${subject}`);
  return found;
}

function extractUrl(email: EmailMessage): string {
  const match = email.text.match(/https?:\/\/\S+/);
  if (!match) throw new Error(`no URL in email: ${email.text}`);
  return match[0];
}

function settingsCount(userId: string): number {
  return (
    db.prepare('SELECT COUNT(*) AS c FROM settings WHERE userId = ?').get(userId) as { c: number }
  ).c;
}

/** Collapse Set-Cookie headers into a Cookie header for follow-up requests. */
function cookiesFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .filter((pair) => !pair.endsWith('=')) // drop deletions
    .join('; ');
}

async function signUp(email: string, password: string): Promise<void> {
  const res = await app.request(`${BASE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: email.split('@')[0] }),
  });
  expect(res.status).toBe(200);
}

describe('one account per mailbox', () => {
  const post = (email: string) =>
    app.request(`${BASE}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'mailbox123', name: 'Box' }),
    });

  test('refuses throwaway domains and variants of a taken Gmail address', async () => {
    const disposable = await post('x@mailinator.com');
    expect(disposable.status).toBe(400);
    expect(((await disposable.json()) as { code?: string }).code).toBe('EMAIL_DISPOSABLE');

    await signUp('box.owner@gmail.com', 'mailbox123');
    for (const variant of ['boxowner+2@gmail.com', 'b.o.x.owner@googlemail.com']) {
      const res = await post(variant);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { code?: string }).code).toBe('EMAIL_ALIAS_TAKEN');
    }
    expect((await post('other.owner@gmail.com')).status).toBe(200);
  });
});

describe('password rule', () => {
  const post = (email: string, password: string) =>
    app.request(`${BASE}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name: 'Rule' }),
    });

  test('sign-up refuses a password without a digit, a letter, or 8 characters', async () => {
    for (const weak of ['abcdefgh', '12345678', 'abc1']) {
      const res = await post('weak@example.com', weak);
      expect(res.status).toBe(400);
    }
  });
});

async function verifyLatestEmail(): Promise<void> {
  const url = extractUrl(lastEmailMatching(/verify/i));
  const res = await app.request(url);
  // Better Auth redirects to the callbackURL after verifying
  expect([200, 302]).toContain(res.status);
}

async function signIn(email: string, password: string): Promise<Response> {
  return app.request(`${BASE}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

beforeAll(async () => {
  setEmailTransport(async (m) => {
    emails.push(m);
  });

  engine = createAuthEngine({
    database: new Database(':memory:'),
    baseURL: BASE,
    secret: 'test-secret-000000000000000000000000',
    trustedOrigins: [BASE],
  });
  await runAuthMigrations(engine);

  // Mirror the prod wiring in index.ts: session middleware → PAT middleware →
  // auth handler → a probe route standing in for the user-data routes, → the
  // same onError passthrough for the identity seam's fail-closed HTTPException.
  // The whoami probe reads through resolveUserId, so it answers for BOTH
  // credentials: a session cookie and a Bearer PAT must feed the same seam.
  app = new Hono();
  app.use(
    '/api/*',
    makeSessionMiddleware(true, () => engine),
  );
  app.use('/api/*', makePatMiddleware(true));
  app.on(['POST', 'GET'], '/api/auth/*', (c) => engine.handler(c.req.raw));
  app.get('/api/whoami', (c) => c.json({ userId: resolveUserId(true, c) }));
  // Same probe under a SCOPE_MAP-listed resource: whoami isn't token-
  // accessible (default-deny, SECURITY-07), so PAT tests read the seam here.
  app.get('/api/stats', (c) => c.json({ userId: resolveUserId(true, c) }));
  app.get('/api/tokens', (c) => c.json({ tokens: [] }));
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    return c.json({ error: 'Internal Server Error' }, 500);
  });
});

afterAll(() => {
  setEmailTransport(null);
  db.prepare("DELETE FROM api_tokens WHERE name = 'accounts-test-pat'").run();
});

describe('cloud mode rejects unauthenticated access', () => {
  test('no session → 401 before any route runs', async () => {
    const res = await app.request(`${BASE}/api/whoami`);
    expect(res.status).toBe(401);
  });

  test('an unknown Bearer token is rejected by the PAT middleware, not silently ignored', async () => {
    const res = await app.request(`${BASE}/api/whoami`, {
      headers: { Authorization: 'Bearer some-pat' },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Invalid token');
  });

  test('/api/auth/* stays reachable unauthenticated (signup/login must work logged-out)', async () => {
    const res = await app.request(`${BASE}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong-password' }),
    });
    // 401 from Better Auth (bad credentials), NOT the middleware's own 401 —
    // the request reached the engine.
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBeDefined();
  });
});

describe('signup → verify → sign in → session resolves the tenant', () => {
  const EMAIL = 'reader@example.com';
  const PASSWORD = 'correct-horse-battery1';

  test('signup creates an unverified user and sends a verification email', async () => {
    await signUp(EMAIL, PASSWORD);
    const mail = lastEmailMatching(/verify/i);
    expect(mail.to).toBe(EMAIL);
    expect(extractUrl(mail)).toContain('/api/auth/verify-email');
  });

  test('sign-in before verification is refused', async () => {
    const res = await signIn(EMAIL, PASSWORD);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  test('the emailed link verifies the address; sign-in then issues a session', async () => {
    await verifyLatestEmail();
    const res = await signIn(EMAIL, PASSWORD);
    expect(res.status).toBe(200);
    expect(cookiesFrom(res)).toContain('session_token');
  });

  test('the session cookie authenticates API requests and resolves a stable userId', async () => {
    const signin = await signIn(EMAIL, PASSWORD);
    const cookie = cookiesFrom(signin);
    const res = await app.request(`${BASE}/api/whoami`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const { userId } = (await res.json()) as { userId: string };
    expect(userId.length).toBeGreaterThan(0);
    expect(userId).not.toBe(LOCAL_USER_ID);

    // Same session again → same tenant
    const again = await app.request(`${BASE}/api/whoami`, { headers: { Cookie: cookie } });
    expect(((await again.json()) as { userId: string }).userId).toBe(userId);
  });

  test('wrong password → 401', async () => {
    const res = await signIn(EMAIL, 'not-the-password');
    expect(res.status).toBe(401);
  });

  test('two accounts resolve two distinct tenants', async () => {
    await signUp('second@example.com', PASSWORD);
    await verifyLatestEmail();
    const [a, b] = await Promise.all([
      signIn(EMAIL, PASSWORD),
      signIn('second@example.com', PASSWORD),
    ]);
    const who = async (res: Response) => {
      const r = await app.request(`${BASE}/api/whoami`, { headers: { Cookie: cookiesFrom(res) } });
      return ((await r.json()) as { userId: string }).userId;
    };
    const [userA, userB] = [await who(a), await who(b)];
    expect(userA).not.toBe(userB);
  });

  test('PAT management is reachable with a session — the table is tenanted now (#218)', async () => {
    const signin = await signIn(EMAIL, PASSWORD);
    const res = await app.request(`${BASE}/api/tokens`, {
      headers: { Cookie: cookiesFrom(signin) },
    });
    expect(res.status).toBe(200);
  });
});

describe('per-user PATs (#218): a token is a first-class cloud credential', () => {
  const EMAIL = 'automator@example.com';
  const PASSWORD = 'scripts-need-love-too1';

  async function tenantOf(
    headers: Record<string, string>,
  ): Promise<{ status: number; userId?: string }> {
    const res = await app.request(`${BASE}/api/stats`, { headers });
    if (!res.ok) return { status: res.status };
    return { status: res.status, userId: ((await res.json()) as { userId: string }).userId };
  }

  test("a PAT resolves its owner's tenant through the same seam a session does", async () => {
    await signUp(EMAIL, PASSWORD);
    await verifyLatestEmail();
    const session = await signIn(EMAIL, PASSWORD);
    const viaSession = await tenantOf({ Cookie: cookiesFrom(session) });

    const pat = insertPat(viaSession.userId!);
    const viaPat = await tenantOf({ Authorization: `Bearer ${pat}` });

    expect(viaPat.status).toBe(200);
    expect(viaPat.userId).toBe(viaSession.userId);
  });

  test("a pre-accounts token (userId 'local') is refused in cloud", async () => {
    const stale = insertPat(LOCAL_USER_ID);
    const res = await app.request(`${BASE}/api/whoami`, {
      headers: { Authorization: `Bearer ${stale}` },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('predates accounts');
  });

  test('a PAT cannot reach token management — no minting successors from a leaked key', async () => {
    const session = await signIn(EMAIL, PASSWORD);
    const { userId } = await tenantOf({ Cookie: cookiesFrom(session) });
    const pat = insertPat(userId!);
    const res = await app.request(`${BASE}/api/tokens`, {
      headers: { Authorization: `Bearer ${pat}` },
    });
    expect(res.status).toBe(403);
  });

  test('a non-Bearer Authorization header still 401s (nothing falls through the session handoff)', async () => {
    const res = await app.request(`${BASE}/api/whoami`, {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    });
    expect(res.status).toBe(401);
  });
});

describe('password reset', () => {
  const EMAIL = 'forgetful@example.com';
  const OLD_PASSWORD = 'original-password-1';
  const NEW_PASSWORD = 'brand-new-password-2';

  test('request → emailed link → reset → old password dead, new one works', async () => {
    await signUp(EMAIL, OLD_PASSWORD);
    await verifyLatestEmail();

    const req = await app.request(`${BASE}/api/auth/request-password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, redirectTo: '/reset' }),
    });
    expect(req.status).toBe(200);

    const url = extractUrl(lastEmailMatching(/reset/i));
    const token =
      url.match(/reset-password\/([^?#]+)/)?.[1] ?? new URL(url).searchParams.get('token');
    expect(token).toBeTruthy();

    const reset = await app.request(`${BASE}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: NEW_PASSWORD, token }),
    });
    expect(reset.status).toBe(200);

    expect((await signIn(EMAIL, OLD_PASSWORD)).status).toBe(401);
    expect((await signIn(EMAIL, NEW_PASSWORD)).status).toBe(200);
  });

  test('reset request for an unknown email does not leak whether the account exists', async () => {
    const res = await app.request(`${BASE}/api/auth/request-password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ghost@example.com', redirectTo: '/reset' }),
    });
    expect(res.status).toBe(200);
  });
});

describe('account deletion (#227): emailed-link right-to-erasure', () => {
  const EMAIL = 'deleter@example.com';
  const BYSTANDER = 'bystander@example.com';
  const PASSWORD = 'erase-me-please-9';

  // The bystander's seeded row must be cleaned up even if the test throws, so
  // the shared test DB is left as we found it.
  let bystanderId: string | null = null;
  afterEach(() => {
    if (bystanderId) db.prepare('DELETE FROM settings WHERE userId = ?').run(bystanderId);
    bystanderId = null;
  });

  async function tenantIdFor(cookie: string): Promise<string> {
    const res = await app.request(`${BASE}/api/whoami`, { headers: { Cookie: cookie } });
    return ((await res.json()) as { userId: string }).userId;
  }

  test('delete-user emails a link; following it wipes the tenant, spares others, and kills the account', async () => {
    // Two verified accounts, each with a row of tenant data in the app DB.
    await signUp(BYSTANDER, PASSWORD);
    await verifyLatestEmail();
    bystanderId = await tenantIdFor(cookiesFrom(await signIn(BYSTANDER, PASSWORD)));

    await signUp(EMAIL, PASSWORD);
    await verifyLatestEmail();
    const cookie = cookiesFrom(await signIn(EMAIL, PASSWORD));
    const userId = await tenantIdFor(cookie);
    expect(userId).not.toBe(LOCAL_USER_ID);

    db.prepare('INSERT INTO settings (userId, key, value) VALUES (?, ?, ?)').run(
      userId,
      'theme',
      '"dark"',
    );
    db.prepare('INSERT INTO settings (userId, key, value) VALUES (?, ?, ?)').run(
      bystanderId,
      'theme',
      '"light"',
    );

    // sendDeleteAccountVerification is configured (lib/accounts.ts), so the POST
    // emails a confirmation link and does NOT delete inline.
    const start = await app.request(`${BASE}/api/auth/delete-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ callbackURL: `${BASE}/login?deleted=1` }),
    });
    expect(start.status).toBe(200);
    expect(((await start.json()) as { message: string }).message).toMatch(
      /verification email sent/i,
    );
    // Nothing is erased until the link is followed.
    expect(settingsCount(userId)).toBe(1);

    // The emailed link (session attached) completes the deletion and redirects.
    const url = extractUrl(lastEmailMatching(/deletion/i));
    expect(url).toContain('/api/auth/delete-user/callback');
    const done = await app.request(url, { headers: { Cookie: cookie } });
    expect([200, 302]).toContain(done.status);

    // The deleting tenant's data is gone; the bystander's is untouched.
    expect(settingsCount(userId)).toBe(0);
    expect(settingsCount(bystanderId)).toBe(1);

    // The account itself no longer exists — the old credentials are dead.
    expect((await signIn(EMAIL, PASSWORD)).status).toBe(401);
  });
});

describe('turnstile captcha (when configured)', () => {
  test('sign-up without an x-captcha-response token is rejected before touching the user store', async () => {
    const guarded = createAuthEngine({
      database: new Database(':memory:'),
      baseURL: BASE,
      secret: 'test-secret-000000000000000000000000',
      trustedOrigins: [BASE],
      turnstileSecretKey: 'turnstile-test-secret',
    });
    await runAuthMigrations(guarded);
    const guardedApp = new Hono();
    guardedApp.on(['POST', 'GET'], '/api/auth/*', (c) => guarded.handler(c.req.raw));

    const res = await guardedApp.request(`${BASE}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'bot@example.com', password: 'password-123456', name: 'bot' }),
    });
    expect(res.ok).toBe(false);
    // Fails closed locally (MISSING_RESPONSE) — no siteverify network call.
    expect(res.status).toBeLessThan(500);
  });

  test('the engine without a turnstile key loads no captcha plugin (selfhost/dev default)', () => {
    // two-factor is the always-on baseline (per-user opt-in, so its presence
    // gates nothing); captcha stays strictly key-conditional.
    expect((engine.options.plugins ?? []).map((p) => p.id)).toEqual(['two-factor']);
  });
});

describe('BYO OIDC (#218, when configured)', () => {
  test('OIDC options load the generic-oauth plugin; the default engine has none', () => {
    const withOidc = createAuthEngine({
      database: new Database(':memory:'),
      baseURL: BASE,
      secret: 'test-secret-000000000000000000000000',
      trustedOrigins: [BASE],
      oidc: { issuer: 'https://idp.example.com', clientId: 'lector', clientSecret: 'shh' },
    });
    const ids = (withOidc.options.plugins ?? []).map((p) => p.id);
    expect(ids).toContain('generic-oauth');

    // The keyless default engine (shared harness) stays plugin-free — BYO
    // OIDC is opt-in exactly like the captcha.
    expect((engine.options.plugins ?? []).map((p) => p.id)).not.toContain('generic-oauth');
  });

  test('oidcDiscoveryUrl takes an issuer origin (trailing slash or not) or a pasted discovery URL', () => {
    const want = 'https://idp.example.com/.well-known/openid-configuration';
    expect(oidcDiscoveryUrl('https://idp.example.com')).toBe(want);
    expect(oidcDiscoveryUrl('https://idp.example.com/')).toBe(want);
    // Keycloak-style issuer path, pasted straight from IdP docs.
    const pasted = 'https://kc.example.com/realms/home/.well-known/openid-configuration';
    expect(oidcDiscoveryUrl(pasted)).toBe(pasted);
  });
});

describe('selfhost stays auth-off single-user', () => {
  test('the passthrough middleware never consults the engine and the seam resolves "local"', async () => {
    const selfhost = new Hono();
    // engine thunk that would explode if the selfhost path ever touched it
    selfhost.use(
      '/api/*',
      makeSessionMiddleware(false, () => {
        throw new Error('selfhost must not construct the auth engine');
      }),
    );
    selfhost.get('/api/whoami', (c) => c.json({ userId: resolveUserId(false, c) }));

    const res = await selfhost.request('http://localhost/api/whoami');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { userId: string }).userId).toBe(LOCAL_USER_ID);
  });

  test('the identity seam fails closed in cloud when no middleware ran (wiring bug ≠ shared tenant)', () => {
    expect(() => resolveUserId(true, undefined)).toThrow(HTTPException);
  });
});

describe('invite codes at sign-up', () => {
  async function signUpWith(email: string, code?: string): Promise<Response> {
    return await app.request(`${BASE}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(code ? { 'x-invite-code': code } : {}) },
      body: JSON.stringify({ email, password: 'correct-horse-battery-9', name: 'Invitee' }),
    });
  }

  afterEach(() => {
    delete process.env.INVITE_REQUIRED;
  });

  test('with the gate on, a missing or wrong code is refused', async () => {
    process.env.INVITE_REQUIRED = '1';
    expect((await signUpWith('gate-none@example.test')).status).toBe(403);
    expect((await signUpWith('gate-bad@example.test', 'WRONGCODE')).status).toBe(403);
  });

  test('with the gate on, a personal code lets the sign-up through and links the invite', async () => {
    process.env.INVITE_REQUIRED = '1';
    const code = getOrCreateInviteCode('iv-signup-inviter');
    const res = await signUpWith('gate-ok@example.test', code);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string } };
    const row = db
      .prepare('SELECT inviterId, status FROM invites WHERE inviteeId = ?')
      .get(body.user.id) as { inviterId: string; status: string };
    expect(row).toEqual({ inviterId: 'iv-signup-inviter', status: 'pending' });
    db.prepare("DELETE FROM invites WHERE inviterId = 'iv-signup-inviter'").run();
    db.prepare("DELETE FROM invite_codes WHERE userId = 'iv-signup-inviter'").run();
  });

  test('with the gate off, no code is needed and a bad code does not block', async () => {
    expect((await signUpWith('open-none@example.test')).status).toBe(200);
    expect((await signUpWith('open-bad@example.test', 'WRONGCODE')).status).toBe(200);
  });
});

describe('the welcome plan on email verification', () => {
  function clearWelcome() {
    db.prepare('DELETE FROM redeem_uses WHERE code = ?').run(WELCOME_CODE);
    db.prepare('DELETE FROM redeem_codes WHERE code = ?').run(WELCOME_CODE);
    db.prepare("DELETE FROM redeem_campaigns WHERE name = 'welcome-accounts-test'").run();
  }

  afterEach(clearWelcome);

  async function signUpAndVerify(email: string): Promise<string> {
    const res = await app.request(`${BASE}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'correct-horse-battery-9', name: 'Welcome' }),
    });
    expect(res.status).toBe(200);
    const { user } = (await res.json()) as { user: { id: string } };
    await verifyLatestEmail();
    return user.id;
  }

  function seedWelcome(expiresAt: string) {
    createCampaign({
      name: 'welcome-accounts-test',
      plan: 'cloud',
      days: 15,
      perUserLimit: 1,
      totalLimit: 1000,
      expiresAt,
      codes: { mode: 'shared', code: WELCOME_CODE },
    });
  }

  test('verifying the email grants 15 days of Plus with no code typed', async () => {
    seedWelcome('2999-01-01T00:00:00.000Z');
    const userId = await signUpAndVerify('welcome-auto@example.test');
    const grant = activeGrant(userId);
    expect(grant?.plan).toBe('cloud');
    const days = (Date.parse(grant!.endsAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(14.9);
    expect(days).toBeLessThan(15.1);
    db.prepare('DELETE FROM plan_grants WHERE userId = ?').run(userId);
  });

  test('after the end date verification works and grants nothing', async () => {
    seedWelcome('2000-01-01T00:00:00.000Z');
    const userId = await signUpAndVerify('welcome-late@example.test');
    expect(activeGrant(userId)).toBeNull();
    const session = await signIn('welcome-late@example.test', 'correct-horse-battery-9');
    expect(session.status).toBe(200);
  });

  test('a redeem step that throws does not fail the verification, and the welcome mail still goes', async () => {
    const calls: string[] = [];
    await runAfterEmailVerification(
      { id: 'u-throw', email: 'throw@example.test' },
      {
        redeem: () => {
          throw new Error('db locked');
        },
        welcome: async (id) => {
          calls.push(id);
          return 'sent';
        },
      },
    );
    expect(calls).toEqual(['u-throw']);
  });
});

describe('Google sign-in through the OIDC path', () => {
  const GOOGLE = 'https://accounts.google.com';
  const OTHER = 'https://idp.example.com';
  const PASSWORD = 'correct-horse-battery-9';

  interface Profile {
    sub: string;
    email: string;
    email_verified: boolean;
    name: string;
  }

  let profile: Profile;
  let realFetch: typeof fetch;
  let googleDb: Database;
  let googleApp: Hono;
  let otherDb: Database;
  let otherApp: Hono;

  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

  function fakeIssuer(origin: string) {
    return {
      issuer: origin,
      authorization_endpoint: `${origin}/auth`,
      token_endpoint: `${origin}/token`,
      userinfo_endpoint: `${origin}/userinfo`,
    };
  }

  function makeApp(database: Database, issuer: string) {
    const oidcEngine = createAuthEngine({
      database,
      baseURL: BASE,
      secret: 'test-secret-000000000000000000000000',
      trustedOrigins: [BASE],
      oidc: { issuer, clientId: 'client', clientSecret: 'secret' },
    });
    const honoApp = new Hono();
    honoApp.on(['POST', 'GET'], '/api/auth/*', (c) => oidcEngine.handler(c.req.raw));
    return { oidcEngine, honoApp };
  }

  beforeAll(async () => {
    realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      for (const origin of [GOOGLE, OTHER]) {
        if (url === `${origin}/.well-known/openid-configuration`) {
          return Response.json(fakeIssuer(origin));
        }
        if (url === `${origin}/token`) {
          const idToken = `${b64({ alg: 'none' })}.${b64({ iss: origin, aud: 'client', ...profile })}.sig`;
          return Response.json({ access_token: 'at', token_type: 'Bearer', id_token: idToken });
        }
      }
      return realFetch(input, init);
    }) as typeof fetch;

    googleDb = new Database(':memory:');
    const google = makeApp(googleDb, GOOGLE);
    googleApp = google.honoApp;
    await runAuthMigrations(google.oidcEngine);

    otherDb = new Database(':memory:');
    const other = makeApp(otherDb, OTHER);
    otherApp = other.honoApp;
    await runAuthMigrations(other.oidcEngine);
  });

  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  afterEach(() => {
    delete process.env.INVITE_REQUIRED;
    db.prepare('DELETE FROM redeem_uses WHERE code = ?').run(WELCOME_CODE);
    db.prepare('DELETE FROM redeem_codes WHERE code = ?').run(WELCOME_CODE);
    db.prepare("DELETE FROM redeem_campaigns WHERE name = 'welcome-google-test'").run();
    db.prepare("DELETE FROM source_counts WHERE source = 'baidu'").run();
  });

  function seedWelcome() {
    createCampaign({
      name: 'welcome-google-test',
      plan: 'cloud',
      days: 15,
      perUserLimit: 1,
      totalLimit: 1000,
      expiresAt: '2999-01-01T00:00:00.000Z',
      codes: { mode: 'shared', code: WELCOME_CODE },
    });
  }

  function grantCount(userId: string): number {
    return (
      db.prepare('SELECT COUNT(*) AS c FROM redeem_uses WHERE userId = ?').get(userId) as {
        c: number;
      }
    ).c;
  }

  function signupRows(): number {
    const row = db
      .prepare(
        "SELECT COALESCE(SUM(count), 0) AS c FROM source_counts WHERE event = 'signup' AND source = 'baidu'",
      )
      .get() as { c: number };
    return row.c;
  }

  /** Runs the redirect dance: start at the app, come back from the provider with a code. */
  async function login(
    target: Hono,
    who: Profile,
    extra: { cookie?: string; additionalData?: Record<string, unknown> } = {},
  ): Promise<Response> {
    profile = who;
    const start = await target.request(`${BASE}/api/auth/sign-in/oauth2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: 'oidc',
        callbackURL: `${BASE}/dash`,
        additionalData: extra.additionalData,
      }),
    });
    expect(start.status).toBe(200);
    const { url } = (await start.json()) as { url: string };
    const state = new URL(url).searchParams.get('state');
    const cookie = [cookiesFrom(start), extra.cookie].filter(Boolean).join('; ');
    return target.request(`${BASE}/api/auth/oauth2/callback/oidc?code=abc&state=${state}`, {
      headers: { cookie },
    });
  }

  function cameBackOk(res: Response): void {
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`${BASE}/dash`);
    expect(cookiesFrom(res)).toContain('session_token');
  }

  function row<T>(database: Database, sql: string, ...args: string[]): T | undefined {
    return (database.prepare(sql).get(...args) as T | null) ?? undefined;
  }

  async function signUpLocal(target: Hono, email: string): Promise<string> {
    const res = await target.request(`${BASE}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD, name: 'Local' }),
    });
    expect(res.status).toBe(200);
    return ((await res.json()) as { user: { id: string } }).user.id;
  }

  const credentialRows = (database: Database, userId: string) =>
    (
      database
        .prepare("SELECT COUNT(*) AS c FROM account WHERE userId = ? AND providerId = 'credential'")
        .get(userId) as { c: number }
    ).c;

  const sessionRows = (database: Database, userId: string) =>
    (
      database.prepare('SELECT COUNT(*) AS c FROM session WHERE userId = ?').get(userId) as {
        c: number;
      }
    ).c;

  test('isGoogleIssuer accepts the origin and its discovery URL and nothing else', () => {
    expect(isGoogleIssuer('https://accounts.google.com')).toBe(true);
    expect(isGoogleIssuer('https://accounts.google.com/')).toBe(true);
    expect(isGoogleIssuer(`${GOOGLE}/.well-known/openid-configuration`)).toBe(true);
    expect(isGoogleIssuer('https://accounts.google.com.evil.example')).toBe(false);
    expect(isGoogleIssuer('https://idp.example.com')).toBe(false);
  });

  test('a new Google account is verified, counted once, and gets the welcome plan once', async () => {
    seedWelcome();
    const who = { sub: 'g-new', email: 'new.reader@gmail.com', email_verified: true, name: 'New' };
    const before = signupRows();
    const first = await login(googleApp, who, { cookie: 'rf_src=baidu.zh' });
    cameBackOk(first);
    const user = row<{ id: string; emailVerified: number }>(
      googleDb,
      'SELECT id, emailVerified FROM user WHERE email = ?',
      who.email,
    )!;
    expect(user.emailVerified).toBe(1);
    expect(grantCount(user.id)).toBe(1);
    expect(activeGrant(user.id)?.plan).toBe('cloud');
    expect(signupRows()).toBe(before + 1);

    cameBackOk(await login(googleApp, who, { cookie: 'rf_src=baidu.zh' }));
    expect(grantCount(user.id)).toBe(1);
    expect(signupRows()).toBe(before + 1);
    db.prepare('DELETE FROM plan_grants WHERE userId = ?').run(user.id);
  });

  test('a verified email account is joined and keeps its password and data', async () => {
    const email = 'verified.owner@gmail.com';
    const id = await signUpLocal(googleApp, email);
    googleDb.prepare('UPDATE user SET emailVerified = 1 WHERE id = ?').run(id);
    const before = signupRows();

    cameBackOk(
      await login(
        googleApp,
        { sub: 'g-verified', email, email_verified: true, name: 'V' },
        {
          cookie: 'rf_src=baidu.zh',
        },
      ),
    );
    expect(googleDb.prepare('SELECT COUNT(*) AS c FROM user WHERE email = ?').get(email)).toEqual({
      c: 1,
    });
    const linked = row<{ userId: string }>(
      googleDb,
      "SELECT userId FROM account WHERE providerId = 'oidc' AND accountId = 'g-verified'",
    );
    expect(linked?.userId).toBe(id);
    expect(credentialRows(googleDb, id)).toBe(1);
    expect((await signInOn(googleApp, email)).status).toBe(200);
    expect(signupRows()).toBe(before);
  });

  async function signInOn(target: Hono, email: string): Promise<Response> {
    return target.request(`${BASE}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
  }

  test('an unverified account is joined, loses its password and sessions, and gets the welcome plan', async () => {
    seedWelcome();
    const email = 'planted@gmail.com';
    const id = await signUpLocal(googleApp, email);
    googleDb
      .prepare(
        `INSERT INTO session (id, token, userId, expiresAt, createdAt, updatedAt)
         VALUES ('planted-session', 'planted-token', ?, ?, ?, ?)`,
      )
      .run(id, '2999-01-01T00:00:00.000Z', new Date().toISOString(), new Date().toISOString());
    expect(credentialRows(googleDb, id)).toBe(1);

    cameBackOk(
      await login(googleApp, { sub: 'g-planted', email, email_verified: true, name: 'P' }),
    );
    const user = row<{ id: string; emailVerified: number }>(
      googleDb,
      'SELECT id, emailVerified FROM user WHERE email = ?',
      email,
    )!;
    expect(user.id).toBe(id);
    expect(user.emailVerified).toBe(1);
    expect(credentialRows(googleDb, id)).toBe(0);
    expect(
      row(googleDb, "SELECT 1 AS x FROM session WHERE id = 'planted-session'"),
    ).toBeUndefined();
    expect(sessionRows(googleDb, id)).toBe(1);
    expect((await signInOn(googleApp, email)).status).not.toBe(200);
    expect(grantCount(id)).toBe(1);
    db.prepare('DELETE FROM plan_grants WHERE userId = ?').run(id);
  });

  test('an email that Google does not call verified joins nothing', async () => {
    const email = 'unconfirmed@gmail.com';
    const id = await signUpLocal(googleApp, email);
    const res = await login(googleApp, {
      sub: 'g-unconfirmed',
      email,
      email_verified: false,
      name: 'U',
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`${BASE}/login?error=account_not_linked`);
    expect(credentialRows(googleDb, id)).toBe(1);
    expect(
      row(googleDb, "SELECT 1 AS x FROM account WHERE providerId = 'oidc' AND userId = ?", id),
    ).toBeUndefined();
  });

  test('a Google login gets no session on an account with two-factor on', async () => {
    const email = 'two.factor@gmail.com';
    const id = await signUpLocal(googleApp, email);
    googleDb
      .prepare('UPDATE user SET emailVerified = 1, twoFactorEnabled = 1 WHERE id = ?')
      .run(id);
    const res = await login(googleApp, {
      sub: 'g-two-factor',
      email,
      email_verified: true,
      name: 'T',
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`${BASE}/login?error=unable_to_create_session`);
    expect(googleDb.prepare('SELECT COUNT(*) AS c FROM session WHERE userId = ?').get(id)).toEqual({
      c: 0,
    });
  });

  test('another issuer never joins an unverified account, even with email_verified true', async () => {
    const email = 'other.issuer@example.test';
    const id = await signUpLocal(otherApp, email);
    const res = await login(otherApp, {
      sub: 'o-1',
      email,
      email_verified: true,
      name: 'O',
    });
    expect(res.headers.get('location')).toBe(`${BASE}/login?error=account_not_linked`);
    expect(credentialRows(otherDb, id)).toBe(1);
  });

  test('a cancelled Google login lands on /login with the provider error', async () => {
    const res = await googleApp.request(
      `${BASE}/api/auth/oauth2/callback/oidc?error=access_denied`,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`${BASE}/login?error=access_denied`);
  });

  test('one account per mailbox also holds for a new Google account', async () => {
    const id = await signUpLocal(googleApp, 'alias.owner@gmail.com');
    googleDb.prepare('UPDATE user SET emailVerified = 1 WHERE id = ?').run(id);
    const res = await login(googleApp, {
      sub: 'g-alias',
      email: 'aliasowner@gmail.com',
      email_verified: true,
      name: 'A',
    });
    expect(res.headers.get('location')).toBe(`${BASE}/login?error=email_alias_taken`);
    expect(
      row(googleDb, 'SELECT 1 AS x FROM user WHERE email = ?', 'aliasowner@gmail.com'),
    ).toBeUndefined();
  });

  test('with the invite gate on, a new Google account needs a code and keeps the invite link', async () => {
    process.env.INVITE_REQUIRED = '1';
    const who = { sub: 'g-invite', email: 'invited@gmail.com', email_verified: true, name: 'I' };
    const refused = await login(googleApp, who);
    expect(refused.headers.get('location')).toBe(`${BASE}/login?error=invite_required`);
    expect(row(googleDb, 'SELECT 1 AS x FROM user WHERE email = ?', who.email)).toBeUndefined();

    const code = getOrCreateInviteCode('iv-google-inviter');
    cameBackOk(await login(googleApp, who, { additionalData: { inviteCode: code } }));
    const invitee = row<{ id: string }>(
      googleDb,
      'SELECT id FROM user WHERE email = ?',
      who.email,
    )!;
    expect(
      db.prepare('SELECT inviterId, status FROM invites WHERE inviteeId = ?').get(invitee.id),
    ).toEqual({ inviterId: 'iv-google-inviter', status: 'pending' });
    db.prepare("DELETE FROM invites WHERE inviterId = 'iv-google-inviter'").run();
    db.prepare("DELETE FROM invite_codes WHERE userId = 'iv-google-inviter'").run();
  });

  test('the captcha does not guard the provider login', async () => {
    const guardedDb = new Database(':memory:');
    const guarded = createAuthEngine({
      database: guardedDb,
      baseURL: BASE,
      secret: 'test-secret-000000000000000000000000',
      trustedOrigins: [BASE],
      turnstileSecretKey: 'turnstile-test-secret',
      oidc: { issuer: GOOGLE, clientId: 'client', clientSecret: 'secret' },
    });
    await runAuthMigrations(guarded);
    const guardedApp = new Hono();
    guardedApp.on(['POST', 'GET'], '/api/auth/*', (c) => guarded.handler(c.req.raw));
    cameBackOk(
      await login(guardedApp, {
        sub: 'g-bot',
        email: 'human@gmail.com',
        email_verified: true,
        name: 'H',
      }),
    );
  });
});
