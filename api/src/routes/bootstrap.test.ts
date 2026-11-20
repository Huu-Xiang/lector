import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { makeAccountStatusMiddleware } from '../lib/admin';
import { makeBillingMiddleware } from '../lib/billing';
import { SCOPE_MAP } from '../lib/auth';
import { makeBootstrapRoutes, type BootstrapRouteDeps } from './bootstrap';

function buildCloudApp(opts: {
  sessionUserId: string | null;
  suspended?: boolean;
  billingStatus?: string | null;
  billingEnforced?: boolean;
  freeTierEnabled?: boolean;
  targetLanguage?: string | null;
  deps?: Partial<BootstrapRouteDeps>;
}) {
  const app = new Hono();

  // Mirror sessionMiddleware: set userId or 401
  app.use('/api/*', async (c, next) => {
    if (!opts.sessionUserId) return c.json({ error: 'Authentication required' }, 401);
    c.set('userId', opts.sessionUserId);
    return next();
  });

  app.use(
    '/api/*',
    makeAccountStatusMiddleware({
      enabled: true,
      checkSuspended: () => Boolean(opts.suspended),
    }),
  );

  app.use(
    '/api/*',
    makeBillingMiddleware({
      enforced: opts.billingEnforced ?? true,
      freeTierEnabled: opts.freeTierEnabled ?? false,
      exemptEmails: new Set(),
      resolveEmail: () => 'user@example.com',
      isBillingExempt: () => false,
    }),
  );

  app.route(
    '/api/bootstrap',
    makeBootstrapRoutes({
      mode: 'cloud',
      authRequired: true,
      billingEnforced: opts.billingEnforced ?? true,
      freeTierEnabled: opts.freeTierEnabled ?? false,
      exemptEmails: new Set(),
      checkSuspended: () => Boolean(opts.suspended),
      checkBillingExempt: () => false,
      resolveEmail: () => 'user@example.com',
      resolveBillingStatus: () => opts.billingStatus ?? null,
      readUser: (id) => ({ id, email: 'user@example.com', name: 'Reader' }),
      readTargetLanguage: () => opts.targetLanguage ?? null,
      ...opts.deps,
    }),
  );

  return app;
}

describe('GET /api/bootstrap', () => {
  it('returns 401 in cloud mode when unauthenticated', async () => {
    const app = buildCloudApp({ sessionUserId: null });
    const res = await app.request('/api/bootstrap');
    expect(res.status).toBe(401);
  });

  it('returns 200 with private no-store headers and active billing in cloud mode', async () => {
    const app = buildCloudApp({
      sessionUserId: 'user-1',
      billingStatus: 'active',
      targetLanguage: 'fr',
    });
    const res = await app.request('/api/bootstrap');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('Vary')).toBe('Cookie');
    const body = await res.json();
    expect(body).toEqual({
      mode: 'cloud',
      user: { id: 'user-1', email: 'user@example.com', name: 'Reader' },
      billing: {
        enforced: true,
        accessAllowed: true,
        status: 'active',
        suspended: false,
      },
      targetLanguage: 'fr',
    });
  });

  it('bypasses billingMiddleware for lapsed accounts and reports accessAllowed: false', async () => {
    const app = buildCloudApp({
      sessionUserId: 'user-lapsed',
      billingStatus: 'canceled',
      targetLanguage: 'de',
    });
    const res = await app.request('/api/bootstrap');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.billing).toEqual({
      enforced: true,
      accessAllowed: false,
      status: 'canceled',
      suspended: false,
    });
  });

  it('bypasses accountStatusMiddleware for suspended accounts and reports suspended: true', async () => {
    const app = buildCloudApp({
      sessionUserId: 'user-suspended',
      suspended: true,
      billingStatus: 'active',
    });
    const res = await app.request('/api/bootstrap');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.billing.suspended).toBe(true);
    expect(body.billing.accessAllowed).toBe(false);
  });

  it('returns 200 with user: null and accessAllowed: true in selfhost mode', async () => {
    const app = new Hono();
    app.route(
      '/api/bootstrap',
      makeBootstrapRoutes({
        mode: 'selfhost',
        authRequired: false,
        readTargetLanguage: () => 'ja',
      }),
    );

    const res = await app.request('/api/bootstrap');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    const body = await res.json();
    expect(body).toEqual({
      mode: 'selfhost',
      user: null,
      billing: {
        enforced: false,
        accessAllowed: true,
        status: 'selfhost',
        suspended: false,
      },
      targetLanguage: 'ja',
    });
  });

  it('returns 200 in cloud external-gate mode (authRequired: false)', async () => {
    const app = new Hono();
    app.route(
      '/api/bootstrap',
      makeBootstrapRoutes({
        mode: 'cloud',
        authRequired: false,
        readTargetLanguage: () => null,
      }),
    );

    const res = await app.request('/api/bootstrap');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      mode: 'cloud',
      user: null,
      billing: {
        enforced: false,
        accessAllowed: true,
        status: 'none',
        suspended: false,
      },
      targetLanguage: null,
    });
  });

  it('stays out of PAT SCOPE_MAP (browser/selfhost only, PAT default-deny)', () => {
    expect('bootstrap' in SCOPE_MAP).toBe(false);
  });
});
