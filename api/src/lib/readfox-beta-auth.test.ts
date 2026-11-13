import '../test-guard';
import { expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { createAuthEngine, provisionReadfoxBetaClient, runAuthMigrations } from './accounts';
import { setEmailTransport } from './email';

function cookies(response: Response): string {
  return response.headers
    .getSetCookie()
    .filter((cookie) => !/; Max-Age=0(?:;|$)/i.test(cookie))
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}

test('a verified primary password account signs into a separate beta account with a signed continuation', async () => {
  const mainDb = new Database(':memory:');
  const betaDb = new Database(':memory:');
  let main: ReturnType<typeof createAuthEngine>;
  let beta: ReturnType<typeof createAuthEngine>;
  const primary = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: (req) => main.handler(req) });
  const preview = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: (req) => beta.handler(req) });
  const mainOrigin = primary.url.origin;
  const betaOrigin = preview.url.origin;
  const secret = 'beta-client-secret-isolated-test-0000';
  const previousInvite = process.env.INVITE_REQUIRED;
  const email = 'beta-reader@example.com';
  const password = 'reader-test-9876';
  function post(origin: string, path: string, body: unknown, cookie = '') {
    return fetch(origin + '/api/auth/' + path, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(body),
      redirect: 'manual',
    });
  }
  try {
    delete process.env.INVITE_REQUIRED;
    setEmailTransport(async () => {});
    main = createAuthEngine({
      database: mainDb,
      baseURL: mainOrigin,
      trustedOrigins: [mainOrigin],
      secret: 'main-session-secret-isolated-test-0000',
      betaIssuerLoginOrigin: mainOrigin,
    });
    beta = createAuthEngine({
      database: betaDb,
      baseURL: betaOrigin,
      trustedOrigins: [betaOrigin],
      secret: 'beta-session-secret-isolated-test-0000',
      betaConsumer: true,
      oidc: { issuer: mainOrigin, clientId: 'readfox-beta', clientSecret: secret },
    });
    await runAuthMigrations(main);
    await runAuthMigrations(beta);
    await provisionReadfoxBetaClient(main, betaOrigin, secret);
    await provisionReadfoxBetaClient(main, betaOrigin, secret);
    expect(
      (await post(mainOrigin, 'sign-up/email', { email, password, name: 'Reader' })).status,
    ).toBe(200);
    mainDb.run('UPDATE user SET emailVerified = 1 WHERE email = ?', [email]);
    process.env.INVITE_REQUIRED = '1';
    expect((await post(betaOrigin, 'sign-in/email', { email, password })).status).toBe(401);

    const start = await post(betaOrigin, 'sign-in/oauth2', {
      providerId: 'oidc',
      callbackURL: betaOrigin + '/vocab-test/history',
    });
    expect(start.status).toBe(200);
    const authorization = (await start.json()).url;
    const wrongCallback = new URL(authorization);
    wrongCallback.searchParams.set(
      'redirect_uri',
      'https://example.com/api/auth/oauth2/callback/oidc',
    );
    const rejected = await fetch(wrongCallback, { redirect: 'manual' });
    expect(rejected.headers.get('location') ?? '').not.toStartWith('https://example.com');
    const loginRedirect = await fetch(authorization, { redirect: 'manual' });
    const login = new URL(loginRedirect.headers.get('location')!);
    expect(login.pathname).toBe('/beta-login');
    const query = login.searchParams.toString();
    const signIn = await post(mainOrigin, 'sign-in/email', { email, password });
    expect(signIn.status).toBe(200);
    const cookie = cookies(signIn);
    const tampered = await post(
      mainOrigin,
      'oauth2/continue',
      {
        selected: true,
        oauth_query: query + '&scope=openid',
      },
      cookie,
    );
    expect(tampered.status).toBeGreaterThanOrEqual(400);
    const continuation = await post(
      mainOrigin,
      'oauth2/continue',
      {
        selected: true,
        oauth_query: query,
      },
      cookie,
    );
    const result = await continuation.json();
    expect({ status: continuation.status, redirect: result.redirect }).toEqual({
      status: 200,
      redirect: true,
    });
    const callback = await fetch(result.url, {
      headers: { Cookie: cookies(start) },
      redirect: 'manual',
    });
    expect(callback.headers.get('location')).toBe(betaOrigin + '/vocab-test/history');
    const verifier = 'a'.repeat(64);
    const challenge = new Bun.CryptoHasher('sha256').update(verifier).digest('hex');
    const finish = await fetch(betaOrigin + '/api/auth/native-auth/finish', {
      method: 'POST',
      headers: {
        Cookie: cookies(callback),
        Origin: betaOrigin,
        'x-readfox-auth-challenge': challenge,
      },
    });
    expect(finish.status).toBe(200);
    const { code } = await finish.json();
    const redeem = (proof: string, origin = betaOrigin) =>
      fetch(betaOrigin + '/api/auth/native-auth/redeem', {
        method: 'POST',
        headers: {
          Origin: origin,
          'x-readfox-auth-code': code,
          'x-readfox-auth-verifier': proof,
        },
      });
    expect((await redeem(verifier, mainOrigin)).status).toBe(403);
    expect((await redeem('b'.repeat(64))).status).toBe(401);
    const redeemed = await redeem(verifier);
    expect(redeemed.status).toBe(200);
    const inAppSession = await fetch(betaOrigin + '/api/auth/get-session', {
      headers: { Cookie: cookies(redeemed) },
    });
    expect((await inAppSession.json()).user.email).toBe(email);
    expect((await redeem(verifier)).status).toBe(401);
    const account = betaDb
      .query<{ email: string; emailVerified: number }, []>('SELECT email, emailVerified FROM user')
      .get();
    expect(account).toEqual({ email, emailVerified: 1 });
    expect(
      betaDb
        .query('SELECT providerId, password, accessToken, refreshToken, idToken FROM account')
        .all(),
    ).toEqual([
      { providerId: 'oidc', password: null, accessToken: null, refreshToken: null, idToken: null },
    ]);
    const betaSession = await fetch(betaOrigin + '/api/auth/get-session', {
      headers: { Cookie: cookies(callback) },
    });
    expect((await betaSession.json()).user.email).toBe(email);
    const replay = await fetch(result.url, {
      headers: { Cookie: cookies(start) },
      redirect: 'manual',
    });
    expect(replay.headers.get('location')).not.toBe(betaOrigin + '/vocab-test/history');
    expect(cookies(replay)).not.toContain('session_token=');
    expect(betaDb.query('SELECT COUNT(*) AS count FROM user').get()).toEqual({ count: 1 });
  } finally {
    setEmailTransport(null);
    if (previousInvite === undefined) delete process.env.INVITE_REQUIRED;
    else process.env.INVITE_REQUIRED = previousInvite;
    primary.stop(true);
    preview.stop(true);
    mainDb.close();
    betaDb.close();
  }
});
