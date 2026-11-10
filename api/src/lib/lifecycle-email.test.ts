import '../test-guard';
import { describe, test, expect, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import path from 'node:path';
import {
  ANKI_WORD_THRESHOLD,
  LIFECYCLE_TEMPLATES,
  REVIEW_DUE_MAX_MAILS_PER_SWEEP,
  SEND_RETRY_BACKOFF_MS,
  createdAtMs,
  hasRealUse,
  languageLabel,
  notifyGlossCapHit,
  notifyVocabSaved,
  savedWordCount,
  sendWelcomeEmail,
  startLifecycleEmailWorker,
  starterLine,
  stopLifecycleEmailWorker,
  sweepLifecycleEmails,
  type LifecycleDeps,
} from './lifecycle-email';
import { recordUnsubscribe } from './email-unsubscribe';
import type { EmailMessage } from './email';

const NOW = new Date('2026-08-25T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

function createSchema(): Database {
  const database = new Database(':memory:');
  database.exec(`
    CREATE TABLE user (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT,
      emailVerified INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE email_sends (
      userId TEXT NOT NULL,
      templateAlias TEXT NOT NULL,
      sentAt TEXT NOT NULL,
      PRIMARY KEY (userId, templateAlias)
    );
    CREATE TABLE email_unsubscribes (
      email TEXT PRIMARY KEY,
      unsubscribedAt TEXT NOT NULL
    );
    CREATE TABLE settings (
      userId TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (userId, key)
    );
    CREATE TABLE vocab (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      text TEXT NOT NULL,
      state TEXT NOT NULL
    );
    CREATE TABLE learner_events (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      eventType TEXT NOT NULL
    );
    CREATE TABLE lessons (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      progress_percentComplete REAL NOT NULL DEFAULT 0,
      progress_scrollPosition INTEGER NOT NULL DEFAULT 0,
      lastReadAt TEXT
    );
    CREATE TABLE plan_grants (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      plan TEXT NOT NULL,
      startsAt TEXT NOT NULL,
      endsAt TEXT NOT NULL
    );
    CREATE TABLE billing_subscriptions (
      paddleSubscriptionId TEXT PRIMARY KEY,
      paddleCustomerId TEXT NOT NULL,
      userId TEXT,
      status TEXT NOT NULL
    );
    CREATE TABLE billing_customers (
      paddleCustomerId TEXT PRIMARY KEY,
      email TEXT NOT NULL
    );
    CREATE TABLE admin_account_flags (
      userId TEXT PRIMARY KEY,
      compedPlan TEXT,
      suspended INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE dailyStats (
      userId TEXT NOT NULL,
      date TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'fr',
      wordsRead INTEGER DEFAULT 0,
      newWordsSaved INTEGER DEFAULT 0,
      minutesRead INTEGER DEFAULT 0,
      clozePracticed INTEGER DEFAULT 0,
      dictionaryLookups INTEGER DEFAULT 0,
      ankiReviews INTEGER DEFAULT 0,
      PRIMARY KEY (userId, date, language)
    );
  `);
  return database;
}

function insertUser(
  database: Database,
  opts: {
    id?: string;
    email?: string;
    name?: string | null;
    verified?: boolean;
    createdAt?: string;
  } = {},
): string {
  const id = opts.id ?? 'user-1';
  database
    .prepare('INSERT INTO user (id, email, name, emailVerified, createdAt) VALUES (?, ?, ?, ?, ?)')
    .run(
      id,
      opts.email ?? 'ada@example.com',
      opts.name === undefined ? 'Ada' : opts.name,
      opts.verified === false ? 0 : 1,
      opts.createdAt ?? '2026-08-25T00:00:00.000Z',
    );
  return id;
}

function insertWords(
  database: Database,
  userId: string,
  count: number,
  state = 'new',
  start = 0,
): void {
  for (let i = 0; i < count; i++) {
    const n = start + i;
    database
      .prepare('INSERT INTO vocab (id, userId, text, state) VALUES (?, ?, ?, ?)')
      .run(`${userId}-w${n}-${state}`, userId, `woord-${n}`, state);
  }
}

function sentAliases(database: Database, userId: string): string[] {
  return (
    database
      .prepare('SELECT templateAlias FROM email_sends WHERE userId = ? ORDER BY templateAlias')
      .all(userId) as { templateAlias: string }[]
  ).map((row) => row.templateAlias);
}

function deps(
  database: Database,
  inbox: EmailMessage[],
  extra: Partial<LifecycleDeps> = {},
): Partial<LifecycleDeps> {
  return {
    database,
    now: () => NOW,
    send: async (message) => {
      inbox.push(message);
    },
    cloud: true,
    hasResendKey: true,
    enabled: true,
    appUrl: 'https://app.lector.dev',
    reviewCount: () => 0,
    ...extra,
  };
}

afterEach(() => {
  stopLifecycleEmailWorker();
  delete process.env.EMAIL_UNSUB_SECRET;
});

function withUnsubSecret(): void {
  process.env.EMAIL_UNSUB_SECRET = 'test-unsub-secret';
}

describe('sendWelcomeEmail', () => {
  test('sends nothing while the product email switch is off', async () => {
    withUnsubSecret();
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const userId = insertUser(database);
    expect(await sendWelcomeEmail(userId, deps(database, inbox, { enabled: false }))).toBe(
      'skipped',
    );
    expect(await sweepLifecycleEmails(deps(database, inbox, { enabled: false }))).toEqual({
      sent: 0,
      skipped: 0,
    });
    expect(inbox).toHaveLength(0);
  });

  test('sends the welcome template once to a verified cloud user', async () => {
    withUnsubSecret();
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const userId = insertUser(database);
    database
      .prepare('INSERT INTO settings (userId, key, value) VALUES (?, ?, ?)')
      .run(userId, 'targetLanguage', '"af"');

    expect(await sendWelcomeEmail(userId, deps(database, inbox))).toBe('sent');
    expect(await sendWelcomeEmail(userId, deps(database, inbox))).toBe('skipped');
    expect(inbox).toHaveLength(1);
    expect(inbox[0].meta?.alias).toBe(LIFECYCLE_TEMPLATES.welcome);
    expect(inbox[0].meta?.variables).toMatchObject({
      USER_NAME: 'Ada',
      LANGUAGE: 'Afrikaans',
      APP_URL: 'https://app.lector.dev',
    });
    expect(String(inbox[0].meta?.variables?.STOP_URL)).toContain('/api/email/unsubscribe?token=');
    expect(inbox[0].headers?.['List-Unsubscribe']).toMatch(
      /^<https?:\/\/.+\/api\/email\/unsubscribe\?token=.+>$/,
    );
    expect(inbox[0].headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(inbox[0].text).toContain('/api/email/unsubscribe?token=');
    expect(sentAliases(database, userId)).toEqual([LIFECYCLE_TEMPLATES.welcome]);
  });

  test('skips when the app is not cloud', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const userId = insertUser(database);
    expect(await sendWelcomeEmail(userId, deps(database, inbox, { cloud: false }))).toBe('skipped');
    expect(inbox).toHaveLength(0);
    expect(sentAliases(database, userId)).toEqual([]);
  });

  test('skips when RESEND_API_KEY is absent', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const userId = insertUser(database);
    expect(await sendWelcomeEmail(userId, deps(database, inbox, { hasResendKey: false }))).toBe(
      'skipped',
    );
    expect(inbox).toHaveLength(0);
  });

  test('skips an unverified user', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const userId = insertUser(database, { verified: false });
    expect(await sendWelcomeEmail(userId, deps(database, inbox))).toBe('skipped');
    expect(inbox).toHaveLength(0);
  });

  test('skips when the user table is absent', async () => {
    const database = new Database(':memory:');
    const inbox: EmailMessage[] = [];
    expect(await sendWelcomeEmail('user-1', deps(database, inbox))).toBe('skipped');
    expect(inbox).toHaveLength(0);
  });

  test('a transport error does not throw and releases the send row', async () => {
    const database = createSchema();
    const userId = insertUser(database);
    const result = await sendWelcomeEmail(
      userId,
      deps(database, [], {
        send: async () => {
          throw new Error('Resend down');
        },
      }),
    );
    expect(result).toBe('skipped');
    expect(sentAliases(database, userId)).toEqual([]);
  });
});

describe('notifyVocabSaved', () => {
  test('sends Anki at 10 saved words and not at 9', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const userId = insertUser(database);
    insertWords(database, userId, 9);
    expect(savedWordCount(database, userId)).toBe(9);
    expect(await notifyVocabSaved(userId, deps(database, inbox))).toBe('skipped');
    expect(inbox).toHaveLength(0);

    insertWords(database, userId, 1, 'new', 9);
    expect(savedWordCount(database, userId)).toBe(ANKI_WORD_THRESHOLD);
    expect(await notifyVocabSaved(userId, deps(database, inbox))).toBe('sent');
    expect(await notifyVocabSaved(userId, deps(database, inbox))).toBe('skipped');
    expect(inbox).toHaveLength(1);
    expect(inbox[0].meta?.alias).toBe(LIFECYCLE_TEMPLATES.anki);
  });

  test('ignored words do not count toward the Anki threshold', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const userId = insertUser(database);
    insertWords(database, userId, 10, 'ignored');
    insertWords(database, userId, 9, 'new');
    expect(await notifyVocabSaved(userId, deps(database, inbox))).toBe('skipped');
    expect(inbox).toHaveLength(0);
  });
});

describe('notifyGlossCapHit', () => {
  test('sends the free-tier gloss-cap template once', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const userId = insertUser(database);
    expect(await notifyGlossCapHit(userId, deps(database, inbox))).toBe('sent');
    expect(await notifyGlossCapHit(userId, deps(database, inbox))).toBe('skipped');
    expect(inbox).toHaveLength(1);
    expect(inbox[0].meta?.alias).toBe(LIFECYCLE_TEMPLATES.glossCap);
  });
});

describe('hasRealUse', () => {
  test('a starter lastReadAt with no progress is not real use', () => {
    const database = createSchema();
    const userId = insertUser(database);
    database
      .prepare(
        'INSERT INTO lessons (id, userId, progress_percentComplete, progress_scrollPosition, lastReadAt) VALUES (?, ?, ?, ?, ?)',
      )
      .run('les-1', userId, 0, 0, '2026-08-25T00:00:00.000Z');
    expect(hasRealUse(database, userId)).toBe(false);
  });

  test('lesson progress or a learner event is real use', () => {
    const database = createSchema();
    const userId = insertUser(database, { id: 'user-progress' });
    database
      .prepare(
        'INSERT INTO lessons (id, userId, progress_percentComplete, progress_scrollPosition) VALUES (?, ?, ?, ?)',
      )
      .run('les-1', userId, 0.1, 0);
    expect(hasRealUse(database, userId)).toBe(true);

    const other = insertUser(database, { id: 'user-event', email: 'other@example.com' });
    database
      .prepare('INSERT INTO learner_events (id, userId, eventType) VALUES (?, ?, ?)')
      .run('evt-1', other, 'lesson.opened');
    expect(hasRealUse(database, other)).toBe(true);
  });
});

describe('sweepLifecycleEmails', () => {
  test('sends day-1 after 24 hours with no saved word', async () => {
    withUnsubSecret();
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const userId = insertUser(database, {
      createdAt: new Date(NOW.getTime() - 25 * HOUR).toISOString(),
    });
    const first = await sweepLifecycleEmails(deps(database, inbox));
    expect(first.sent).toBe(1);
    expect(inbox.map((m) => m.meta?.alias)).toEqual([LIFECYCLE_TEMPLATES.day1]);
    expect(String(inbox[0].meta?.variables?.STOP_URL)).toContain('/api/email/unsubscribe?token=');
    expect(inbox[0].headers?.['List-Unsubscribe']).toMatch(/^<https?:\/\/.+>$/);

    const second = await sweepLifecycleEmails(deps(database, inbox));
    expect(second.sent).toBe(0);
    expect(inbox).toHaveLength(1);
    expect(sentAliases(database, userId)).toEqual([LIFECYCLE_TEMPLATES.day1]);
  });

  test('does not send welcome from the sweep', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    insertUser(database, { createdAt: NOW.toISOString() });
    await sweepLifecycleEmails(deps(database, inbox));
    expect(inbox).toHaveLength(0);
  });

  test('does not send day-1 before 24 hours', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    insertUser(database, { createdAt: new Date(NOW.getTime() - 23 * HOUR).toISOString() });
    await sweepLifecycleEmails(deps(database, inbox));
    expect(inbox).toHaveLength(0);
  });

  test('does not send day-1 when a word is saved', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const userId = insertUser(database, {
      createdAt: new Date(NOW.getTime() - 25 * HOUR).toISOString(),
    });
    insertWords(database, userId, 1);
    await sweepLifecycleEmails(deps(database, inbox));
    expect(inbox).toHaveLength(0);
  });

  test('sends day-3 after 72 hours and does not also send day-1', async () => {
    withUnsubSecret();
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const userId = insertUser(database, {
      createdAt: new Date(NOW.getTime() - 73 * HOUR).toISOString(),
    });
    database
      .prepare(
        'INSERT INTO lessons (id, userId, progress_percentComplete, progress_scrollPosition, lastReadAt) VALUES (?, ?, ?, ?, ?)',
      )
      .run('les-starter', userId, 0, 0, NOW.toISOString());
    await sweepLifecycleEmails(deps(database, inbox));
    expect(inbox.map((m) => m.meta?.alias)).toEqual([LIFECYCLE_TEMPLATES.day3]);
    expect(sentAliases(database, userId)).toEqual([LIFECYCLE_TEMPLATES.day3]);
  });

  test('does not send day-3 when the user has real use', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const userId = insertUser(database, {
      createdAt: new Date(NOW.getTime() - 73 * HOUR).toISOString(),
    });
    insertWords(database, userId, 1);
    await sweepLifecycleEmails(deps(database, inbox));
    expect(inbox).toHaveLength(0);
  });

  test('does not send day-1 or day-3 to an old unused account', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    insertUser(database, { createdAt: new Date(NOW.getTime() - 10 * 24 * HOUR).toISOString() });
    await sweepLifecycleEmails(deps(database, inbox));
    expect(inbox).toHaveLength(0);
  });

  test('does not send when createdAt is unix seconds for an old account', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const created = Math.floor((NOW.getTime() - 10 * 24 * HOUR) / 1000);
    insertUser(database, { createdAt: String(created) });
    await sweepLifecycleEmails(deps(database, inbox));
    expect(inbox).toHaveLength(0);
  });

  test('skips a user whose createdAt cannot be parsed', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    insertUser(database, { createdAt: 'not-a-date' });
    await sweepLifecycleEmails(deps(database, inbox));
    expect(inbox).toHaveLength(0);
  });

  test('does not send after the address stops product mail', async () => {
    withUnsubSecret();
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    insertUser(database, {
      email: 'ada@example.com',
      createdAt: new Date(NOW.getTime() - 25 * HOUR).toISOString(),
    });
    recordUnsubscribe(database, 'ada@example.com', NOW.toISOString());
    await sweepLifecycleEmails(deps(database, inbox));
    expect(inbox).toHaveLength(0);
  });

  test('skips the whole sweep when not cloud or the key is absent', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    insertUser(database, { createdAt: new Date(NOW.getTime() - 73 * HOUR).toISOString() });
    expect(await sweepLifecycleEmails(deps(database, inbox, { cloud: false }))).toEqual({
      sent: 0,
      skipped: 0,
    });
    expect(await sweepLifecycleEmails(deps(database, inbox, { hasResendKey: false }))).toEqual({
      sent: 0,
      skipped: 0,
    });
    expect(inbox).toHaveLength(0);
  });
});

describe('createdAtMs', () => {
  test('reads ISO, Date, milliseconds, and unix seconds', () => {
    expect(createdAtMs('2026-08-25T12:00:00.000Z')).toBe(NOW.getTime());
    expect(createdAtMs(NOW)).toBe(NOW.getTime());
    expect(createdAtMs(NOW.getTime())).toBe(NOW.getTime());
    expect(createdAtMs(Math.floor(NOW.getTime() / 1000))).toBe(NOW.getTime());
    expect(createdAtMs('not-a-date')).toBeNull();
  });
});

describe('languageLabel', () => {
  test('reads the target language name and falls back', () => {
    const database = createSchema();
    const userId = insertUser(database);
    expect(languageLabel(database, userId)).toBe('your language');
    database
      .prepare('INSERT INTO settings (userId, key, value) VALUES (?, ?, ?)')
      .run(userId, 'targetLanguage', '"af"');
    expect(languageLabel(database, userId)).toBe('Afrikaans');
  });
});

describe('starterLine', () => {
  test('names the seeded lessons for a language that ships a starter series', () => {
    process.env.STARTER_CONTENT_ROOT = path.resolve(
      import.meta.dir,
      '../test-fixtures/starter-content',
    );
    try {
      const database = createSchema();
      const userId = insertUser(database);
      database
        .prepare('INSERT INTO settings (userId, key, value) VALUES (?, ?, ?)')
        .run(userId, 'targetLanguage', '"es"');
      const line = starterLine(database, userId);
      expect(line).toContain('Spanish');
      expect(line).toContain('already in your library');
    } finally {
      delete process.env.STARTER_CONTENT_ROOT;
    }
  });

  test('names the free books of a language that has a library', () => {
    const database = createSchema();
    const userId = insertUser(database);
    database
      .prepare('INSERT INTO settings (userId, key, value) VALUES (?, ?, ?)')
      .run(userId, 'targetLanguage', '"fr"');
    const line = starterLine(database, userId);
    expect(line).toMatch(/^Readfox has \d+ free French books, sorted by level\./);
    expect(line).not.toContain('empty');
  });

  test('asks for a text when the language has no lessons and no free books', () => {
    const database = createSchema();
    const userId = insertUser(database);
    database
      .prepare('INSERT INTO settings (userId, key, value) VALUES (?, ?, ?)')
      .run(userId, 'targetLanguage', '"af"');
    expect(starterLine(database, userId)).toBe(
      'To start, paste an article or import a book in Afrikaans that you want to read.',
    );
  });

  test('is empty when no language is set, so the mail leaves the paragraph out', () => {
    const database = createSchema();
    const userId = insertUser(database);
    expect(starterLine(database, userId)).toBe('');
  });
});

describe('startLifecycleEmailWorker', () => {
  test('does not boot in the selfhost test env', () => {
    expect(startLifecycleEmailWorker()).toBe(false);
  });
});

const DAY = 24 * HOUR;

function insertGrant(
  database: Database,
  userId: string,
  endsInMs: number,
  opts: { id?: string; plan?: string; startedAgoMs?: number; now?: Date } = {},
): string {
  const now = opts.now ?? NOW;
  const id = opts.id ?? `grant-${userId}-${endsInMs}`;
  database
    .prepare('INSERT INTO plan_grants (id, userId, plan, startsAt, endsAt) VALUES (?, ?, ?, ?, ?)')
    .run(
      id,
      userId,
      opts.plan ?? 'cloud',
      new Date(now.getTime() - (opts.startedAgoMs ?? 12 * DAY)).toISOString(),
      new Date(now.getTime() + endsInMs).toISOString(),
    );
  return id;
}

describe('sweepLifecycleEmails: plan ending', () => {
  test('mails a grant that ends in 2 days once, with the shown plan name', async () => {
    withUnsubSecret();
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const userId = insertUser(database, { createdAt: '2025-01-01T00:00:00.000Z' });
    const grantId = insertGrant(database, userId, 2 * DAY);

    expect((await sweepLifecycleEmails(deps(database, inbox))).sent).toBe(1);
    expect(inbox).toHaveLength(1);
    expect(inbox[0].meta?.alias).toBe(LIFECYCLE_TEMPLATES.planEnding);
    expect(inbox[0].subject).toBe('Your Plus plan ends on 27 August 2026');
    expect(inbox[0].text).toContain('https://app.lector.dev/subscribe');
    expect(inbox[0].text).not.toContain('cloud');
    expect(inbox[0].headers?.['List-Unsubscribe']).toBeDefined();
    expect(sentAliases(database, userId)).toEqual([`plan-ending-3d:${grantId}`]);

    expect((await sweepLifecycleEmails(deps(database, inbox))).sent).toBe(0);
    expect(inbox).toHaveLength(1);
  });

  test('says Pro for plus and Max for max', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const a = insertUser(database, { id: 'u-pro', email: 'pro@example.com' });
    insertGrant(database, a, DAY, { plan: 'plus' });
    const b = insertUser(database, { id: 'u-max', email: 'max@example.com' });
    insertGrant(database, b, DAY, { plan: 'max' });
    await sweepLifecycleEmails(deps(database, inbox));
    expect(inbox.map((m) => m.subject).sort()).toEqual([
      expect.stringContaining('Your Max plan'),
      expect.stringContaining('Your Pro plan'),
    ]);
  });

  test('mails only inside the 72-hour window and never a grant that already ended', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const cases: Array<[string, number]> = [
      ['u-ended-1h', -HOUR],
      ['u-ended-10d', -10 * DAY],
      ['u-ended-now', 0],
      ['u-in-4d', 4 * DAY],
      ['u-in-73h', 73 * HOUR],
    ];
    for (const [id, endsInMs] of cases) {
      insertUser(database, { id, email: `${id}@example.com` });
      insertGrant(database, id, endsInMs, { startedAgoMs: 20 * DAY });
    }
    insertUser(database, { id: 'u-in-71h', email: 'u-in-71h@example.com' });
    insertGrant(database, 'u-in-71h', 71 * HOUR);

    await sweepLifecycleEmails(deps(database, inbox));
    expect(inbox.map((m) => m.to)).toEqual(['u-in-71h@example.com']);
  });

  test('skips a grant that has not started', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const userId = insertUser(database);
    insertGrant(database, userId, 2 * DAY, { startedAgoMs: -DAY });
    await sweepLifecycleEmails(deps(database, inbox));
    expect(inbox).toHaveLength(0);
  });

  test('skips a grant when another grant of the user ends later', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const userId = insertUser(database);
    insertGrant(database, userId, 2 * DAY, { id: 'g-soon' });
    insertGrant(database, userId, 30 * DAY, { id: 'g-later', plan: 'max' });
    await sweepLifecycleEmails(deps(database, inbox));
    expect(inbox).toHaveLength(0);
  });

  test('sends one mail per user when two grants end at once', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const userId = insertUser(database);
    insertGrant(database, userId, 2 * DAY, { id: 'g-a' });
    insertGrant(database, userId, 2 * DAY, { id: 'g-b' });
    await sweepLifecycleEmails(deps(database, inbox));
    expect(inbox).toHaveLength(1);
  });

  test('skips an active, trialing or past-due Paddle subscriber, by user id or customer email', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const rows: Array<[string, string]> = [
      ['u-active', 'active'],
      ['u-trial', 'trialing'],
      ['u-due', 'past_due'],
    ];
    for (const [id, status] of rows) {
      insertUser(database, { id, email: `${id}@example.com` });
      insertGrant(database, id, DAY);
      database
        .prepare(
          'INSERT INTO billing_subscriptions (paddleSubscriptionId, paddleCustomerId, userId, status) VALUES (?, ?, ?, ?)',
        )
        .run(`sub-${id}`, `ctm-${id}`, id, status);
    }
    insertUser(database, { id: 'u-email', email: 'Paying@Example.com' });
    insertGrant(database, 'u-email', DAY);
    database
      .prepare('INSERT INTO billing_customers (paddleCustomerId, email) VALUES (?, ?)')
      .run('ctm-email', 'paying@example.com');
    database
      .prepare(
        'INSERT INTO billing_subscriptions (paddleSubscriptionId, paddleCustomerId, userId, status) VALUES (?, ?, NULL, ?)',
      )
      .run('sub-email', 'ctm-email', 'active');

    await sweepLifecycleEmails(deps(database, inbox));
    expect(inbox).toHaveLength(0);
  });

  test('a canceled subscription does not block the mail', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const userId = insertUser(database);
    insertGrant(database, userId, DAY);
    database
      .prepare(
        'INSERT INTO billing_subscriptions (paddleSubscriptionId, paddleCustomerId, userId, status) VALUES (?, ?, ?, ?)',
      )
      .run('sub-old', 'ctm-old', userId, 'canceled');
    await sweepLifecycleEmails(deps(database, inbox));
    expect(inbox).toHaveLength(1);
  });

  test('skips an unsubscribed address, an unverified user and a comped account', async () => {
    withUnsubSecret();
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    insertUser(database, { id: 'u-stop', email: 'stop@example.com' });
    insertGrant(database, 'u-stop', DAY);
    recordUnsubscribe(database, 'stop@example.com', NOW.toISOString());
    insertUser(database, { id: 'u-raw', email: 'raw@example.com', verified: false });
    insertGrant(database, 'u-raw', DAY);
    insertUser(database, { id: 'u-comp', email: 'comp@example.com' });
    insertGrant(database, 'u-comp', DAY);
    database
      .prepare('INSERT INTO admin_account_flags (userId, compedPlan) VALUES (?, ?)')
      .run('u-comp', 'plus');
    await sweepLifecycleEmails(deps(database, inbox));
    expect(inbox).toHaveLength(0);
  });

  test('sends nothing while the switch is off or the app is not cloud', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const userId = insertUser(database);
    insertGrant(database, userId, DAY);
    await sweepLifecycleEmails(deps(database, inbox, { enabled: false }));
    await sweepLifecycleEmails(deps(database, inbox, { cloud: false }));
    expect(inbox).toHaveLength(0);
    expect(sentAliases(database, userId)).toEqual([]);
  });

  test('a later grant gets its own mail', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const userId = insertUser(database);
    insertGrant(database, userId, 2 * DAY, { id: 'g-1' });
    await sweepLifecycleEmails(deps(database, inbox));
    const later = new Date(NOW.getTime() + 30 * DAY);
    insertGrant(database, userId, 2 * DAY, { id: 'g-2', now: later, startedAgoMs: 5 * DAY });
    await sweepLifecycleEmails(deps(database, inbox, { now: () => later }));
    expect(inbox).toHaveLength(2);
    expect(sentAliases(database, userId)).toEqual(['plan-ending-3d:g-1', 'plan-ending-3d:g-2']);
  });

  test('a send failure releases the key so the next sweep retries', async () => {
    const database = createSchema();
    const userId = insertUser(database);
    insertGrant(database, userId, DAY);
    const failing = deps(database, [], {
      send: async () => {
        throw new Error('resend down');
      },
    });
    expect((await sweepLifecycleEmails(failing)).sent).toBe(0);
    expect(sentAliases(database, userId)).toEqual([]);
  });
});

// 18:00 UTC: after the evening gate for users on UTC.
const EVENING = new Date('2026-08-25T18:00:00.000Z');

function dayString(daysAgo: number, now = EVENING): string {
  return new Date(now.getTime() - daysAgo * DAY).toISOString().slice(0, 10);
}

function addStats(
  database: Database,
  userId: string,
  daysAgo: number,
  over: { clozePracticed?: number; dictionaryLookups?: number; minutesRead?: number } = {},
): void {
  database
    .prepare(
      'INSERT INTO dailyStats (userId, date, minutesRead, clozePracticed, dictionaryLookups) VALUES (?, ?, ?, ?, ?)',
    )
    .run(
      userId,
      dayString(daysAgo),
      over.minutesRead ?? 0,
      over.clozePracticed ?? 0,
      over.dictionaryLookups ?? 0,
    );
}

function reviewUser(
  database: Database,
  opts: { id?: string; email?: string; activeDaysAgo?: number; zone?: string } = {},
): string {
  const id = insertUser(database, {
    id: opts.id ?? 'user-review',
    email: opts.email ?? 'review@example.com',
    createdAt: '2025-01-01T00:00:00.000Z',
  });
  database
    .prepare('INSERT INTO settings (userId, key, value) VALUES (?, ?, ?)')
    .run(id, 'targetLanguage', '"fr"');
  database
    .prepare('INSERT INTO settings (userId, key, value) VALUES (?, ?, ?)')
    .run(id, 'timezone', JSON.stringify(opts.zone ?? 'UTC'));
  addStats(database, id, opts.activeDaysAgo ?? 1, { clozePracticed: 3 });
  return id;
}

function reviewDeps(database: Database, inbox: EmailMessage[], words = 7, now = EVENING) {
  return deps(database, inbox, { now: () => now, reviewCount: () => words });
}

function addReviewSend(database: Database, userId: string, daysAgo: number): void {
  database
    .prepare('INSERT INTO email_sends (userId, templateAlias, sentAt) VALUES (?, ?, ?)')
    .run(
      userId,
      `review-due:${dayString(daysAgo)}`,
      new Date(EVENING.getTime() - daysAgo * DAY).toISOString(),
    );
}

describe('sweepLifecycleEmails: review due', () => {
  test('mails a lapsed learner with 5 or more words, with no account age limit', async () => {
    withUnsubSecret();
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const userId = reviewUser(database);

    expect((await sweepLifecycleEmails(reviewDeps(database, inbox))).sent).toBe(1);
    expect(inbox[0].subject).toBe('You have 7 words to review');
    expect(inbox[0].meta?.alias).toBe(LIFECYCLE_TEMPLATES.reviewDue);
    expect(inbox[0].text).toContain('https://app.lector.dev/practice');
    expect(inbox[0].headers?.['List-Unsubscribe']).toBeDefined();
    expect(sentAliases(database, userId)).toEqual(['review-due:2026-08-25']);

    expect((await sweepLifecycleEmails(reviewDeps(database, inbox))).sent).toBe(0);
    expect(inbox).toHaveLength(1);
  });

  test('needs at least 5 words', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    reviewUser(database);
    await sweepLifecycleEmails(reviewDeps(database, inbox, 4));
    expect(inbox).toHaveLength(0);
    await sweepLifecycleEmails(reviewDeps(database, inbox, 5));
    expect(inbox).toHaveLength(1);
  });

  test('skips a user who reviewed or looked up a word today', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const a = reviewUser(database, { id: 'u-rev', email: 'rev@example.com' });
    addStats(database, a, 0, { clozePracticed: 1 });
    const b = reviewUser(database, { id: 'u-look', email: 'look@example.com' });
    addStats(database, b, 0, { dictionaryLookups: 2 });
    await sweepLifecycleEmails(reviewDeps(database, inbox));
    expect(inbox).toHaveLength(0);
  });

  test('reading alone today does not block the mail', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const userId = reviewUser(database);
    addStats(database, userId, 0, { minutesRead: 12 });
    await sweepLifecycleEmails(reviewDeps(database, inbox));
    expect(inbox).toHaveLength(1);
  });

  test('needs activity inside the last 30 days', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    reviewUser(database, { id: 'u-old', email: 'old@example.com', activeDaysAgo: 31 });
    reviewUser(database, { id: 'u-edge', email: 'edge@example.com', activeDaysAgo: 30 });
    await sweepLifecycleEmails(reviewDeps(database, inbox));
    expect(inbox.map((m) => m.to)).toEqual(['edge@example.com']);
  });

  test('waits 3 days between mails', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const userId = reviewUser(database);
    addReviewSend(database, userId, 2);
    await sweepLifecycleEmails(reviewDeps(database, inbox));
    expect(inbox).toHaveLength(0);

    database.prepare('DELETE FROM email_sends WHERE userId = ?').run(userId);
    addReviewSend(database, userId, 3);
    await sweepLifecycleEmails(reviewDeps(database, inbox));
    expect(inbox).toHaveLength(1);
    expect(sentAliases(database, userId)).toEqual([
      'review-due:2026-08-22',
      'review-due:2026-08-25',
    ]);
  });

  test('stops after 3 mails in a row with no activity since, and restarts after activity', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const userId = reviewUser(database, { activeDaysAgo: 12 });
    addReviewSend(database, userId, 10);
    addReviewSend(database, userId, 7);
    addReviewSend(database, userId, 4);
    await sweepLifecycleEmails(reviewDeps(database, inbox));
    expect(inbox).toHaveLength(0);

    addStats(database, userId, 3, { dictionaryLookups: 1 });
    await sweepLifecycleEmails(reviewDeps(database, inbox));
    expect(inbox).toHaveLength(1);
  });

  test('two mails with no activity do not stop the third', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const userId = reviewUser(database, { activeDaysAgo: 9 });
    addReviewSend(database, userId, 7);
    addReviewSend(database, userId, 4);
    await sweepLifecycleEmails(reviewDeps(database, inbox));
    expect(inbox).toHaveLength(1);
  });

  test('waits for the evening in the user zone', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    reviewUser(database, { id: 'u-sh', email: 'sh@example.com', zone: 'Asia/Shanghai' });
    reviewUser(database, { id: 'u-la', email: 'la@example.com', zone: 'America/Los_Angeles' });
    await sweepLifecycleEmails(reviewDeps(database, inbox));
    // 18:00 UTC is 02:00 in Shanghai and 11:00 in Los Angeles.
    expect(inbox).toHaveLength(0);
    const late = new Date('2026-08-26T02:00:00.000Z');
    await sweepLifecycleEmails(reviewDeps(database, inbox, 7, late));
    expect(inbox.map((m) => m.to)).toEqual(['la@example.com']);
  });

  test('sends nothing to an unsubscribed address, with the switch off, or without a language', async () => {
    withUnsubSecret();
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    reviewUser(database, { id: 'u-stop', email: 'stop@example.com' });
    recordUnsubscribe(database, 'stop@example.com', NOW.toISOString());
    reviewUser(database, { id: 'u-nolang', email: 'nolang@example.com' });
    database
      .prepare("DELETE FROM settings WHERE userId = 'u-nolang' AND key = 'targetLanguage'")
      .run();
    await sweepLifecycleEmails(reviewDeps(database, inbox));
    expect(inbox).toHaveLength(0);

    reviewUser(database, { id: 'u-ok', email: 'ok@example.com' });
    await sweepLifecycleEmails({ ...reviewDeps(database, inbox), enabled: false });
    expect(inbox).toHaveLength(0);
  });
});

describe('sweepLifecycleEmails: failures and limits', () => {
  test('one user that throws does not stop the review-due mail to later users', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    reviewUser(database, { id: 'u-bad', email: 'bad@example.com' });
    reviewUser(database, { id: 'u-good', email: 'good@example.com' });
    const quiet = console.error;
    console.error = () => {};
    try {
      await sweepLifecycleEmails(
        deps(database, inbox, {
          now: () => EVENING,
          reviewCount: (userId) => {
            if (userId === 'u-bad') throw new Error('broken vocab');
            return 7;
          },
        }),
      );
    } finally {
      console.error = quiet;
    }
    expect(inbox.map((m) => m.to)).toEqual(['good@example.com']);
  });

  test('one failing sweep does not stop the other sweeps', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    reviewUser(database);
    database.exec('DROP TABLE plan_grants');
    const quiet = console.error;
    console.error = () => {};
    try {
      expect((await sweepLifecycleEmails(reviewDeps(database, inbox))).sent).toBe(1);
    } finally {
      console.error = quiet;
    }
    expect(inbox[0].meta?.alias).toBe(LIFECYCLE_TEMPLATES.reviewDue);
  });

  test('a failed send is not tried again for 6 hours', async () => {
    const database = createSchema();
    const userId = insertUser(database);
    insertGrant(database, userId, DAY);
    let attempts = 0;
    const at = (ms: number) =>
      deps(database, [], {
        now: () => new Date(NOW.getTime() + ms),
        send: async () => {
          attempts += 1;
          throw new Error('resend down');
        },
      });
    const quiet = console.error;
    console.error = () => {};
    try {
      await sweepLifecycleEmails(at(0));
      await sweepLifecycleEmails(at(15 * 60_000));
      await sweepLifecycleEmails(at(SEND_RETRY_BACKOFF_MS - 1));
      expect(attempts).toBe(1);
      await sweepLifecycleEmails(at(SEND_RETRY_BACKOFF_MS));
      expect(attempts).toBe(2);
    } finally {
      console.error = quiet;
    }
    expect(sentAliases(database, userId)).toEqual([]);
  });

  test('a suspended account gets no day-1, plan-ending or review-due mail', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const day1 = insertUser(database, {
      id: 'u-day1',
      email: 'day1@example.com',
      createdAt: new Date(NOW.getTime() - 30 * HOUR).toISOString(),
    });
    const ending = insertUser(database, { id: 'u-end', email: 'end@example.com' });
    insertGrant(database, ending, DAY);
    const review = reviewUser(database, { id: 'u-rev', email: 'rev@example.com' });
    for (const id of [day1, ending, review]) {
      database.prepare('INSERT INTO admin_account_flags (userId, suspended) VALUES (?, 1)').run(id);
    }
    await sweepLifecycleEmails(deps(database, inbox));
    await sweepLifecycleEmails(reviewDeps(database, inbox));
    expect(inbox).toHaveLength(0);

    database.prepare('UPDATE admin_account_flags SET suspended = 0').run();
    await sweepLifecycleEmails(deps(database, inbox));
    expect(inbox.map((m) => m.to).sort()).toEqual(['day1@example.com', 'end@example.com']);
  });

  test('review-due skips a user with no valid stored time zone', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    reviewUser(database, { id: 'u-none', email: 'none@example.com' });
    database.prepare("DELETE FROM settings WHERE userId = 'u-none' AND key = 'timezone'").run();
    reviewUser(database, { id: 'u-bad', email: 'badzone@example.com', zone: 'Not/AZone' });
    await sweepLifecycleEmails(reviewDeps(database, inbox));
    expect(inbox).toHaveLength(0);
  });

  test('plan-ending still sends when the user has no stored time zone', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const userId = insertUser(database);
    insertGrant(database, userId, DAY);
    expect((await sweepLifecycleEmails(deps(database, inbox))).sent).toBe(1);
  });

  test('one review-due sweep sends at most the cap and the next sweep goes on', async () => {
    const database = createSchema();
    const inbox: EmailMessage[] = [];
    const total = REVIEW_DUE_MAX_MAILS_PER_SWEEP + 5;
    for (let i = 0; i < total; i++) {
      reviewUser(database, { id: `u-${i}`, email: `u${i}@example.com` });
    }
    expect((await sweepLifecycleEmails(reviewDeps(database, inbox))).sent).toBe(
      REVIEW_DUE_MAX_MAILS_PER_SWEEP,
    );
    expect((await sweepLifecycleEmails(reviewDeps(database, inbox))).sent).toBe(5);
    expect(inbox).toHaveLength(total);
  });
});
