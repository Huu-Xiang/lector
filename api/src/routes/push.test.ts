import '../test-guard';
import { describe, test, expect, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { db } from '../db';
import { makePushRoutes } from './push';

let currentUser = 'push-user-1';

function app() {
  const root = new Hono();
  root.route(
    '/api/push',
    makePushRoutes(() => currentUser),
  );
  return root;
}

function send(method: string, path: string, body?: unknown) {
  return app().request(`/api/push${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function devices(): { userId: string; token: string; environment: string; locale: string }[] {
  return db
    .prepare('SELECT userId, token, environment, locale FROM push_devices ORDER BY userId')
    .all() as never;
}

beforeEach(() => {
  currentUser = 'push-user-1';
  db.prepare('DELETE FROM push_devices').run();
  db.prepare('DELETE FROM notification_prefs').run();
});

describe('/api/push/prefs', () => {
  test('a new user has the reminder off at 20:00', async () => {
    const res = await send('GET', '/prefs');
    expect(await res.json()).toEqual({ enabled: false, time: '20:00' });
  });

  test('saves the switch and the time, and reads them back', async () => {
    const put = await send('PUT', '/prefs', { enabled: true, time: '07:30' });
    expect(put.status).toBe(200);
    expect(await (await send('GET', '/prefs')).json()).toEqual({ enabled: true, time: '07:30' });
  });

  test('saving again keeps the date of the last send', async () => {
    await send('PUT', '/prefs', { enabled: true, time: '20:00' });
    db.prepare("UPDATE notification_prefs SET lastSentDate = '2026-11-05' WHERE userId = ?").run(
      currentUser,
    );
    await send('PUT', '/prefs', { enabled: false, time: '21:00' });
    const row = db
      .prepare('SELECT reminderEnabled, reminderTime, lastSentDate FROM notification_prefs')
      .get() as { reminderEnabled: number; reminderTime: string; lastSentDate: string };
    expect(row).toEqual({ reminderEnabled: 0, reminderTime: '21:00', lastSentDate: '2026-11-05' });
  });

  test('rejects a time that is not HH:MM', async () => {
    const res = await send('PUT', '/prefs', { enabled: true, time: '25:99' });
    expect(res.status).toBe(400);
  });
});

describe('/api/push/devices', () => {
  test('registers a device with its environment and locale', async () => {
    const res = await send('POST', '/devices', {
      token: 'abc123',
      environment: 'sandbox',
      locale: 'zh-TW',
    });
    expect(res.status).toBe(200);
    expect(devices()).toEqual([
      { userId: 'push-user-1', token: 'abc123', environment: 'sandbox', locale: 'zh-TW' },
    ]);
  });

  test('registering a token again updates the one row', async () => {
    await send('POST', '/devices', { token: 'abc123', environment: 'sandbox', locale: 'en' });
    await send('POST', '/devices', { token: 'abc123', environment: 'production', locale: 'ja' });
    expect(devices()).toEqual([
      { userId: 'push-user-1', token: 'abc123', environment: 'production', locale: 'ja' },
    ]);
  });

  test('the same token for a second user leaves only the second user row', async () => {
    await send('POST', '/devices', { token: 'abc123', environment: 'sandbox', locale: 'en' });
    currentUser = 'push-user-2';
    await send('POST', '/devices', { token: 'abc123', environment: 'sandbox', locale: 'en' });
    expect(devices().map((d) => d.userId)).toEqual(['push-user-2']);
  });

  test('delete removes only the caller device', async () => {
    await send('POST', '/devices', { token: 'abc123', environment: 'sandbox', locale: 'en' });
    currentUser = 'push-user-2';
    await send('POST', '/devices', { token: 'def456', environment: 'sandbox', locale: 'en' });
    await send('DELETE', '/devices', { token: 'abc123' });
    expect(devices().map((d) => d.token)).toEqual(['abc123', 'def456']);
    await send('DELETE', '/devices', { token: 'def456' });
    expect(devices().map((d) => d.token)).toEqual(['abc123']);
  });
});
