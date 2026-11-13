import '../test-guard';
import { beforeEach, describe, expect, test } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import { db } from '../db';
import type { ApnsNotification, ApnsResult, ApnsSender } from './apns';
import {
  reminderCopy,
  startReminderWorker,
  stopReminderWorker,
  sweepReminders,
} from './reminder-worker';

const SHANGHAI_8PM = Date.parse('2026-11-05T12:00:00Z');
const MINUTE = 60_000;

let sent: ApnsNotification[];
let reply: ApnsResult;
let due: Record<string, number>;

const sender: ApnsSender = {
  async send(notification) {
    sent.push(notification);
    return reply;
  },
};

function sweep(at: number, withSender: ApnsSender | null = sender) {
  return sweepReminders({
    now: () => new Date(at),
    sender: withSender,
    dueCount: (userId) => due[userId] ?? 0,
  });
}

function addUser(
  userId: string,
  opts: {
    timeZone?: string;
    time?: string;
    enabled?: boolean;
    locale?: string;
    token?: string;
  } = {},
) {
  db.prepare(
    'INSERT INTO notification_prefs (userId, reminderEnabled, reminderTime) VALUES (?,?,?)',
  ).run(userId, opts.enabled === false ? 0 : 1, opts.time ?? '20:00');
  db.prepare(
    "INSERT INTO push_devices (userId, token, environment, locale, createdAt, lastSeenAt) VALUES (?,?,'sandbox',?,'t','t')",
  ).run(userId, opts.token ?? `token-${userId}`, opts.locale ?? 'en');
  if (opts.timeZone) {
    db.prepare(
      "INSERT OR REPLACE INTO settings (userId, key, value) VALUES (?, 'timezone', ?)",
    ).run(userId, JSON.stringify(opts.timeZone));
  }
}

function tokens(): string[] {
  return (
    db.prepare('SELECT token FROM push_devices ORDER BY token').all() as { token: string }[]
  ).map((row) => row.token);
}

beforeEach(() => {
  sent = [];
  reply = 'sent';
  due = {};
  db.prepare('DELETE FROM push_devices').run();
  db.prepare('DELETE FROM notification_prefs').run();
  for (const table of ['vocab', 'wordCards', 'settings']) {
    db.prepare(`DELETE FROM ${table} WHERE userId LIKE 'rem-%'`).run();
  }
});

describe('sweepReminders', () => {
  test('sends nothing with 0 due cards, and not later that day either', async () => {
    addUser('rem-a', { timeZone: 'Asia/Shanghai' });
    await sweep(SHANGHAI_8PM);
    due['rem-a'] = 3;
    await sweep(SHANGHAI_8PM + 30 * MINUTE);
    expect(sent).toEqual([]);
  });

  test('sends one message with the due count, and a second tick sends nothing', async () => {
    addUser('rem-a', { timeZone: 'Asia/Shanghai' });
    due['rem-a'] = 3;
    expect((await sweep(SHANGHAI_8PM)).sent).toBe(1);
    expect((await sweep(SHANGHAI_8PM + MINUTE)).sent).toBe(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      token: 'token-rem-a',
      environment: 'sandbox',
      title: 'Readfox',
      body: '3 cards due for review',
      data: { path: '/practice' },
    });
  });

  test('sends again on the next local day', async () => {
    addUser('rem-a', { timeZone: 'Asia/Shanghai' });
    due['rem-a'] = 3;
    await sweep(SHANGHAI_8PM);
    await sweep(SHANGHAI_8PM + 24 * 60 * MINUTE);
    expect(sent).toHaveLength(2);
  });

  test('uses each user time zone at the same instant', async () => {
    addUser('rem-shanghai', { timeZone: 'Asia/Shanghai' });
    addUser('rem-newyork', { timeZone: 'America/New_York' });
    due['rem-shanghai'] = 2;
    due['rem-newyork'] = 2;
    await sweep(SHANGHAI_8PM);
    expect(sent.map((n) => n.token)).toEqual(['token-rem-shanghai']);
  });

  test('a restart at 20:00:30 still sends once, and two workers at once send once', async () => {
    addUser('rem-a', { timeZone: 'Asia/Shanghai' });
    due['rem-a'] = 1;
    await Promise.all([sweep(SHANGHAI_8PM + 30_000), sweep(SHANGHAI_8PM + 30_000)]);
    expect(sent).toHaveLength(1);
  });

  test('sends from the chosen time until 2 hours after it, and not outside', async () => {
    due['rem-a'] = 1;
    addUser('rem-a', { timeZone: 'Asia/Shanghai' });
    await sweep(SHANGHAI_8PM - MINUTE);
    expect(sent).toHaveLength(0);
    await sweep(SHANGHAI_8PM + 121 * MINUTE);
    expect(sent).toHaveLength(0);
    await sweep(SHANGHAI_8PM + 120 * MINUTE);
    expect(sent).toHaveLength(1);
  });

  test('a user who turned the reminder off gets nothing', async () => {
    addUser('rem-a', { timeZone: 'Asia/Shanghai', enabled: false });
    due['rem-a'] = 5;
    await sweep(SHANGHAI_8PM);
    expect(sent).toEqual([]);
  });

  test('deletes a token that APNs reports as unregistered', async () => {
    addUser('rem-a', { timeZone: 'Asia/Shanghai' });
    due['rem-a'] = 1;
    reply = 'unregistered';
    await sweep(SHANGHAI_8PM);
    expect(tokens()).toEqual([]);
  });

  test('keeps the token when the send only failed', async () => {
    addUser('rem-a', { timeZone: 'Asia/Shanghai' });
    due['rem-a'] = 1;
    reply = 'failed';
    await sweep(SHANGHAI_8PM);
    expect(tokens()).toEqual(['token-rem-a']);
  });

  test('without APNs settings it sends nothing and keeps the day unclaimed', async () => {
    addUser('rem-a', { timeZone: 'Asia/Shanghai' });
    due['rem-a'] = 1;
    await sweep(SHANGHAI_8PM, null);
    const row = db.prepare('SELECT lastSentDate FROM notification_prefs').get() as {
      lastSentDate: string | null;
    };
    expect(row.lastSentDate).toBeNull();
    await sweep(SHANGHAI_8PM + MINUTE);
    expect(sent).toHaveLength(1);
  });

  test('writes the message in the locale stored with each device', async () => {
    for (const locale of ['zh-CN', 'zh-TW', 'ja', 'ko', 'fr']) {
      addUser(`rem-${locale}`, { timeZone: 'Asia/Shanghai', locale });
      due[`rem-${locale}`] = 4;
    }
    await sweep(SHANGHAI_8PM);
    const bodies = Object.fromEntries(sent.map((n) => [n.token, n.body]));
    expect(bodies['token-rem-zh-CN']).toBe(reminderCopy('zh-CN', 4).body);
    expect(bodies['token-rem-zh-TW']).toBe(reminderCopy('zh-TW', 4).body);
    expect(bodies['token-rem-ja']).toBe(reminderCopy('ja', 4).body);
    expect(bodies['token-rem-ko']).toBe(reminderCopy('ko', 4).body);
    expect(bodies['token-rem-fr']).toBe('4 cards due for review');
    expect(reminderCopy('zh-TW', 4).body).toContain('4');
  });
});

describe('startReminderWorker', () => {
  test('does nothing, and does not throw, when an APNS setting is missing', () => {
    expect(startReminderWorker({ cloud: true, env: {} })).toBe(false);
  });

  test('does nothing outside cloud mode', () => {
    expect(startReminderWorker({ cloud: false, env: {} })).toBe(false);
  });

  test('starts with all settings present', () => {
    const { privateKey } = generateKeyPairSync('ec', {
      namedCurve: 'P-256',
    });
    const env = {
      APNS_KEY_ID: 'K',
      APNS_TEAM_ID: 'T',
      APNS_BUNDLE_ID: 'app.readfox.ios',
      APNS_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    };
    expect(startReminderWorker({ cloud: true, env })).toBe(true);
    stopReminderWorker();
  });
});

describe('the default due count', () => {
  test('counts the cards that GET /api/review/counts counts', async () => {
    const userId = 'rem-real';
    addUser(userId, { timeZone: 'Asia/Shanghai' });
    db.prepare(
      "INSERT OR REPLACE INTO settings (userId, key, value) VALUES (?, 'targetLanguage', '\"en\"')",
    ).run(userId);
    for (let i = 0; i < 3; i++) {
      db.prepare(
        `INSERT INTO vocab (userId, id, text, type, sentence, translation, state, stateUpdatedAt, createdAt, language)
         VALUES (?,?,?,?,?,?,?,?,?,'en')`,
      ).run(userId, `rem-v${i}`, `word${i}`, 'word', `A word${i}.`, 't', 'level1', 't', 't');
      db.prepare(
        `INSERT INTO wordCards (userId, id, language, wordKey, vocabId, state, due, modelVersion, configVersion, createdAt, updatedAt)
         VALUES (?,?,'en',?,?,'review','2026-11-01T00:00:00Z','FSRS-6',1,'t','t')`,
      ).run(userId, `rem-c${i}`, `word${i}`, `rem-v${i}`);
    }
    await sweepReminders({ now: () => new Date(SHANGHAI_8PM), sender });
    expect(sent.map((n) => n.body)).toEqual(['3 cards due for review']);
  });
});
