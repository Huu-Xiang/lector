import '../test-guard';
import { afterEach, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { db } from '../db';
import {
  isUnsubscribed,
  recordUnsubscribe,
  signUnsubscribeToken,
  unsubscribeEmailKey,
} from '../lib/email-unsubscribe';
import emailUnsubscribe from './email-unsubscribe';
import { createEmailPreferencesApp } from './email-preferences';

const EMAILS: Record<string, string> = {
  'u-ada': 'ada@example.com',
  'u-bob': 'bob@example.com',
};

function build(authRequired = true, userId = 'u-ada') {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('userId', userId);
    await next();
  });
  app.route(
    '/',
    createEmailPreferencesApp({ authRequired, userEmail: (id) => EMAILS[id] ?? null }),
  );
  return app;
}

function put(app: Hono, body: unknown, path = '/') {
  return app.request(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  delete process.env.EMAIL_UNSUB_SECRET;
  db.prepare('DELETE FROM email_unsubscribes').run();
});

describe('product email preference', () => {
  test('reads on for a new address', async () => {
    const res = await build().request('/');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ productEmails: true });
  });

  test('turns off, then on again', async () => {
    const app = build();
    expect(await (await put(app, { productEmails: false })).json()).toEqual({
      productEmails: false,
    });
    expect(isUnsubscribed(db, 'ada@example.com')).toBe(true);
    expect(await (await app.request('/')).json()).toEqual({ productEmails: false });

    expect(await (await put(app, { productEmails: true })).json()).toEqual({
      productEmails: true,
    });
    expect(isUnsubscribed(db, 'ada@example.com')).toBe(false);
    expect(await (await app.request('/')).json()).toEqual({ productEmails: true });
  });

  test('turning on also clears a legacy row that holds the plain address', async () => {
    db.prepare('INSERT INTO email_unsubscribes (email, unsubscribedAt) VALUES (?, ?)').run(
      'ada@example.com',
      '2026-01-01T00:00:00.000Z',
    );
    const app = build();
    expect(await (await app.request('/')).json()).toEqual({ productEmails: false });
    await put(app, { productEmails: true });
    expect(isUnsubscribed(db, 'ada@example.com')).toBe(false);
  });

  test('acts only on the session user, never on an address in the request', async () => {
    recordUnsubscribe(db, 'bob@example.com', '2026-01-01T00:00:00.000Z');
    const app = build(true, 'u-ada');
    await put(
      app,
      { productEmails: true, email: 'bob@example.com', userId: 'u-bob' },
      '/?email=bob@example.com',
    );
    expect(isUnsubscribed(db, 'bob@example.com')).toBe(true);

    await put(app, { productEmails: false, email: 'bob@example.com' });
    expect(isUnsubscribed(db, 'ada@example.com')).toBe(true);
    const rows = db.prepare('SELECT email FROM email_unsubscribes').all() as { email: string }[];
    expect(rows.map((r) => r.email).sort()).toEqual(
      [unsubscribeEmailKey('ada@example.com'), unsubscribeEmailKey('bob@example.com')].sort(),
    );
  });

  test('an unsubscribe link shows as off', async () => {
    process.env.EMAIL_UNSUB_SECRET = 'test-secret';
    const token = signUnsubscribeToken('ada@example.com');
    const link = await emailUnsubscribe.request(`/?token=${encodeURIComponent(token!)}`, {
      method: 'POST',
      body: 'List-Unsubscribe=One-Click',
    });
    expect(link.status).toBe(200);
    expect(await (await build().request('/')).json()).toEqual({ productEmails: false });
    expect(await (await build(true, 'u-bob').request('/')).json()).toEqual({
      productEmails: true,
    });
  });

  test('rejects a body without a boolean', async () => {
    const app = build();
    expect((await put(app, {})).status).toBe(400);
    expect((await put(app, { productEmails: 'no' })).status).toBe(400);
    expect(isUnsubscribed(db, 'ada@example.com')).toBe(false);
  });

  test('is not available without accounts (self-host)', async () => {
    const app = build(false);
    expect((await app.request('/')).status).toBe(404);
    expect((await put(app, { productEmails: false })).status).toBe(404);
    expect(db.prepare('SELECT COUNT(*) AS n FROM email_unsubscribes').get()).toEqual({ n: 0 });
  });

  test('is not available when the session user has no email', async () => {
    expect((await build(true, 'u-none').request('/')).status).toBe(404);
  });
});
