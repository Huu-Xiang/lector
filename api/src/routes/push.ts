import { Hono, type Context } from 'hono';
import { db } from '../db';
import { getCurrentUserId } from '../lib/user';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const ENVIRONMENTS = new Set(['sandbox', 'production']);
const MAX_TOKEN_LENGTH = 512;
const DEFAULT_TIME = '20:00';

function tokenOf(body: { token?: unknown } | null): string | null {
  const token = body?.token;
  return typeof token === 'string' && token.length > 0 && token.length <= MAX_TOKEN_LENGTH
    ? token
    : null;
}

export function makePushRoutes(getUserId: (c: Context) => string = getCurrentUserId) {
  const app = new Hono();

  app.get('/prefs', (c) => {
    const row = db
      .prepare('SELECT reminderEnabled, reminderTime FROM notification_prefs WHERE userId = ?')
      .get(getUserId(c)) as { reminderEnabled: number; reminderTime: string } | undefined;
    return c.json({
      enabled: row?.reminderEnabled === 1,
      time: row?.reminderTime ?? DEFAULT_TIME,
    });
  });

  app.put('/prefs', async (c) => {
    const userId = getUserId(c);
    const body = await c.req.json().catch(() => null);
    if (typeof body?.enabled !== 'boolean' || !TIME_PATTERN.test(body?.time)) {
      return c.json({ error: 'invalid_prefs' }, 400);
    }
    db.prepare(
      `INSERT INTO notification_prefs (userId, reminderEnabled, reminderTime) VALUES (?, ?, ?)
       ON CONFLICT(userId) DO UPDATE SET
         reminderEnabled = excluded.reminderEnabled, reminderTime = excluded.reminderTime`,
    ).run(userId, body.enabled ? 1 : 0, body.time);
    return c.json({ enabled: body.enabled, time: body.time });
  });

  app.post('/devices', async (c) => {
    const userId = getUserId(c);
    const body = await c.req.json().catch(() => null);
    const token = tokenOf(body);
    if (!token || !ENVIRONMENTS.has(body.environment) || typeof body.locale !== 'string') {
      return c.json({ error: 'invalid_device' }, 400);
    }
    const at = new Date().toISOString();
    db.transaction(() => {
      db.prepare('DELETE FROM push_devices WHERE token = ? AND userId != ?').run(token, userId);
      db.prepare(
        `INSERT INTO push_devices (userId, token, environment, locale, createdAt, lastSeenAt)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(token) DO UPDATE SET
           environment = excluded.environment, locale = excluded.locale,
           lastSeenAt = excluded.lastSeenAt`,
      ).run(userId, token, body.environment, body.locale.slice(0, 16), at, at);
    })();
    return c.json({ ok: true });
  });

  app.delete('/devices', async (c) => {
    const userId = getUserId(c);
    const token = tokenOf(await c.req.json().catch(() => null));
    if (!token) return c.json({ error: 'invalid_device' }, 400);
    db.prepare('DELETE FROM push_devices WHERE userId = ? AND token = ?').run(userId, token);
    return c.json({ ok: true });
  });

  return app;
}

export default makePushRoutes();
