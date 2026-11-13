import type { Database } from 'bun:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { db } from '../db';
import { config } from './config';
import { addDaysToDateString, dateStringInTimeZone, getConfiguredTimeZone } from './dates';
import { isNativeLanguageCode } from './languages';
import { isProductPublicBook, validateProductEvent, type ProductEvent } from './product-events';

const DAY_MS = 86_400_000;
const OBSERVATION_DAYS = 90;
const FIRST_READ_DAYS = 14;
const SHORT_RECEIPT_DAYS = 2;
const MAX_REPORT_ROWS = 25_000;
const MAX_ACCOUNT_EVENTS_PER_DAY = 1500;
const LATENCY_BUCKETS = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 30000, 60000];
const learningEvents = [
  'reading_started',
  'reading_time',
  'word_lookup',
  'word_saved',
  'review_answer',
  'review_completed',
  'quiz_finished',
];
const oncePerLessonDay = [
  'reading_opened',
  'reading_started',
  'reading_difficulty',
  'reading_progress',
];
const cohortWindows = [
  ['d1', 1],
  ['d7', 7],
  ['d14', 14],
  ['d30', 30],
  ['first_read_14d', FIRST_READ_DAYS - 1],
  ['lookup_twice_14d', 13],
] as const;

type Dimensions = Record<string, string | number>;
type EventOptions = { userId?: string; key?: string; now?: Date; database?: Database };
type SignupOptions = EventOptions & {
  userId: string;
  source?: string;
  browserLanguage?: string;
  uiLanguage?: string;
  campaign?: string;
};

interface DailyRow {
  date: string;
  event: string;
  dimensions: string;
  count: number;
  value: number;
  tokenInput: number;
  tokenOutput: number;
  tokenTotal: number;
  tokenSamples: number;
}

interface CohortRow {
  period: string;
  source: string;
  metric: string;
  eligible: number;
  returned: number;
}

let lastWarning = 0;
let failures = 0;

function warn(operation: string) {
  failures += 1;
  if (Date.now() - lastWarning > 60_000) {
    lastWarning = Date.now();
    console.warn(`[product-analytics] ${operation} failed`);
  }
}

function day(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function summaryCutoff(now: Date): string {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 2);
  return day(cutoff);
}

function digest(...parts: string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function version(): string {
  const build = process.env.GIT_COMMIT;
  return build && /^[a-f0-9]{7,40}$/i.test(build) ? build.slice(0, 12) : 'unknown';
}

function environment(): string {
  return process.env.READFOX_BETA_CONSUMER === '1' ||
    process.env.BETTER_AUTH_URL?.includes('test.readfox.app')
    ? 'beta'
    : 'production';
}

function initCoverage(database: Database, now: Date) {
  database.run(
    "INSERT OR IGNORE INTO product_analytics_state (key, value) VALUES ('coverageStart', ?)",
    [now.toISOString()],
  );
}

function state(database: Database, key: string): string | null {
  const row = database
    .query('SELECT value FROM product_analytics_state WHERE key = ?')
    .get(key) as { value: string } | null;
  return row?.value ?? null;
}

function excludedEmails(): Set<string> {
  return new Set(
    [process.env.LECTOR_ADMIN_EMAILS, process.env.BILLING_EXEMPT_EMAILS]
      .flatMap((value) => (value ?? '').split(','))
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function accountDate(value: number | string | null): Date | null {
  if (value === null || value === '') return null;
  const numeric = Number(value);
  const date = new Date(Number.isFinite(numeric) ? numeric : String(value));
  return Number.isFinite(date.getTime()) ? date : null;
}

function accountCanRecord(database: Database, userId: string, now: Date, verify: boolean): boolean {
  const account = database.query('SELECT email, createdAt FROM user WHERE id=?').get(userId) as {
    email: string;
    createdAt: number | string;
  } | null;
  if (!account || excludedEmails().has(account.email.toLowerCase())) return false;
  const created = accountDate(account.createdAt);
  return !verify || (!!created && created.getTime() >= now.getTime() - OBSERVATION_DAYS * DAY_MS);
}

function translationLanguage(database: Database, userId: string): string | undefined {
  const setting = database
    .query("SELECT value FROM settings WHERE userId=? AND key='nativeLanguage'")
    .get(userId) as { value: string } | null;
  if (!setting) return undefined;
  let code: unknown = setting.value;
  try {
    code = JSON.parse(setting.value);
  } catch {
    // Settings created by older versions may contain a bare language code.
  }
  return isNativeLanguageCode(code) ? code : undefined;
}

function lessonDimensions(database: Database, userId: string, lessonId: string): Dimensions | null {
  const lesson = database
    .query('SELECT language, collectionId FROM lessons WHERE userId = ? AND id = ?')
    .get(userId, lessonId) as { language: string; collectionId: string | null } | null;
  if (!lesson) return null;
  const collection = lesson.collectionId ?? '';
  const library = `library-${lesson.language}-`;
  const publicBook = `${lesson.language}/${collection.slice(library.length)}`;
  if (collection.startsWith(library) && isProductPublicBook(publicBook)) {
    return { language: lesson.language, contentKind: 'library', publicBook };
  }
  const contentKind = collection.startsWith('reading-feed-')
    ? 'feed'
    : collection.startsWith('starter-')
      ? 'starter'
      : 'imported';
  return { language: lesson.language, contentKind };
}

function eventDimensions(event: ProductEvent): Dimensions {
  const dimensions: Dimensions = { version: version() };
  for (const key of [
    'language',
    'feature',
    'outcome',
    'step',
    'publicBook',
    'source',
    'browserLanguage',
    'uiLanguage',
    'campaign',
  ] as const) {
    const value = event[key];
    if (value !== undefined) dimensions[key] = value;
  }
  if (event.latencyMs !== undefined) {
    dimensions.latencyBucketMs =
      LATENCY_BUCKETS.find((limit) => event.latencyMs! <= limit) ?? 'overflow';
  }
  if (event.event === 'quiz_progress' || event.event === 'reading_progress') {
    if (event.value !== undefined) dimensions.milestone = event.value;
  }
  return dimensions;
}

function bump(database: Database, date: string, event: ProductEvent, dimensions: string) {
  const hasTokens =
    event.tokenInput !== undefined ||
    event.tokenOutput !== undefined ||
    event.tokenTotal !== undefined;
  database.run(
    `INSERT INTO product_daily (date,event,dimensions,count,value,tokenInput,tokenOutput,tokenTotal,tokenSamples)
     VALUES (?,?,?,1,?,?,?,?,?) ON CONFLICT(date,event,dimensions) DO UPDATE SET
       count=count+1, value=value+excluded.value, tokenInput=tokenInput+excluded.tokenInput,
       tokenOutput=tokenOutput+excluded.tokenOutput, tokenTotal=tokenTotal+excluded.tokenTotal,
       tokenSamples=tokenSamples+excluded.tokenSamples`,
    [
      date,
      event.event,
      dimensions,
      event.value ?? 0,
      event.tokenInput ?? 0,
      event.tokenOutput ?? 0,
      event.tokenTotal ?? 0,
      Number(hasTokens),
    ],
  );
}

function storeEvent(
  database: Database,
  event: ProductEvent,
  options: EventOptions,
  now: Date,
): boolean {
  const { userId, key } = options;
  const date = day(now);
  const dimensions = eventDimensions(event);
  const subjectId = event.lessonId ?? event.roundId;
  if (event.lessonId) {
    const owned = userId ? lessonDimensions(database, userId, event.lessonId) : null;
    if (!owned) return false;
    Object.assign(dimensions, owned);
  }
  if (event.roundId && userId) {
    const round = database
      .query('SELECT language FROM reviewRounds WHERE userId = ? AND id = ?')
      .get(userId, event.roundId) as { language: string } | null;
    if (!round) return false;
    dimensions.language = round.language;
  }
  if (userId && (event.event === 'word_lookup' || event.event === 'reading_help')) {
    const code = translationLanguage(database, userId);
    if (code) dimensions.translationLanguage = code;
  }
  const json = JSON.stringify(dimensions);
  const subject = subjectId && userId ? digest(userId, subjectId) : '';
  let dedupe = key ?? randomUUID();
  if (subject && (oncePerLessonDay.includes(event.event) || event.event === 'reading_completed')) {
    const observation = event.event === 'reading_completed' ? '' : date;
    dedupe = digest(subject, observation, String(event.value ?? ''));
  } else if (event.roundId) {
    dedupe = subject;
  }
  const eventKey = digest(event.event, userId ?? '', dedupe);
  if (userId) {
    if (
      database
        .query('SELECT 1 FROM product_events WHERE userId=? AND date=? LIMIT 1 OFFSET ?')
        .get(userId, date, MAX_ACCOUNT_EVENTS_PER_DAY - 1)
    ) {
      warn('account event limit');
      return true;
    }
    const startedEarlier =
      event.event === 'reading_started' &&
      subject &&
      !!database
        .query(
          "SELECT 1 FROM product_events WHERE userId=? AND subject=? AND event='reading_started' AND date<? LIMIT 1",
        )
        .get(userId, subject, date);
    const inserted = database.run(
      `INSERT OR IGNORE INTO product_events (eventKey,userId,date,occurredAt,event,subject,dimensions)
       VALUES (?,?,?,?,?,?,?)`,
      [eventKey, userId, date, now.toISOString(), event.event, subject, json],
    ).changes;
    if (!inserted) return true;
    if (startedEarlier) bump(database, date, { event: 'reading_resumed' }, json);
  } else if (key) {
    if (
      !database.run('INSERT OR IGNORE INTO product_receipts (eventKey,expiresAt) VALUES (?,?)', [
        eventKey,
        new Date(now.getTime() + SHORT_RECEIPT_DAYS * DAY_MS).toISOString(),
      ]).changes
    )
      return true;
  }
  initCoverage(database, now);
  bump(database, date, event, json);
  return true;
}

export function recordProductEvent(input: ProductEvent, options: EventOptions = {}): boolean {
  if (!config.authRequired && !options.database) return false;
  const database = options.database ?? db;
  try {
    const event = validateProductEvent(input);
    if (!event) {
      warn('event validation');
      return false;
    }
    const now = options.now ?? new Date();
    if (now.getTime() < Date.now() - OBSERVATION_DAYS * DAY_MS && !options.database) return true;
    return database.transaction(() => {
      if (
        options.userId &&
        config.authRequired &&
        !accountCanRecord(database, options.userId, now, event.event === 'signup_verified')
      )
        return true;
      return storeEvent(database, event, options, now);
    })();
  } catch {
    warn('event write');
    return false;
  }
}

export function recordProductSignup(options: SignupOptions): boolean {
  if (!config.authRequired && !options.database) return false;
  const { userId, source = 'unknown', browserLanguage, uiLanguage, campaign } = options;
  const database = options.database ?? db;
  const now = options.now ?? new Date();
  const event = validateProductEvent({
    event: 'signup_created',
    source,
    browserLanguage,
    uiLanguage,
    campaign,
  });
  if (!event) return false;
  try {
    return database.transaction(() => {
      if (config.authRequired && !accountCanRecord(database, userId, now, false)) return true;
      const changed = database.run(
        `INSERT OR IGNORE INTO product_attribution (userId,date,source,browserLanguage,uiLanguage,campaign)
         VALUES (?,?,?,?,?,?)`,
        [userId, day(now), source, browserLanguage ?? '', uiLanguage ?? '', campaign ?? ''],
      ).changes;
      return !changed || storeEvent(database, event, { ...options, key: 'first-signup' }, now);
    })();
  } catch {
    warn('signup write');
    return false;
  }
}

function matureCohorts(database: Database, today: string) {
  const placeholders = learningEvents.map(() => '?').join(',');
  const latest = addDaysToDateString(today, -1);
  for (const [metric, offset] of cohortWindows) {
    const limit = addDaysToDateString(latest, -offset);
    const end = `date(a.date,'+${offset} days')`;
    const observation =
      metric === 'first_read_14d'
        ? `EXISTS(SELECT 1 FROM product_events e WHERE e.userId=a.userId AND e.event='reading_started' AND e.date BETWEEN a.date AND ${end})`
        : metric === 'lookup_twice_14d'
          ? `(SELECT COUNT(DISTINCT e.date) FROM product_events e WHERE e.userId=a.userId AND e.event='word_lookup' AND e.date BETWEEN a.date AND ${end}) >= 2`
          : `EXISTS(SELECT 1 FROM product_events e WHERE e.userId=a.userId AND e.event IN (${placeholders}) AND e.date=${end})`;
    const args = metric.startsWith('d') ? learningEvents : [];
    database.run(
      `INSERT OR IGNORE INTO product_cohorts (period,source,metric,eligible,returned)
       SELECT a.date,a.source,?,COUNT(*),SUM(CASE WHEN ${observation} THEN 1 ELSE 0 END)
       FROM product_attribution a WHERE a.date<=?
       GROUP BY a.date,a.source`,
      [metric, ...args, limit],
    );
  }
}

export function maintainProductAnalytics(now = new Date(), database: Database = db): boolean {
  try {
    const today = day(now);
    const cutoff = new Date(now.getTime() - OBSERVATION_DAYS * DAY_MS).toISOString();
    const summary = summaryCutoff(now);
    database.transaction(() => {
      initCoverage(database, now);
      matureCohorts(database, today);
      database.run('DELETE FROM product_events WHERE occurredAt < ?', [cutoff]);
      database.run('DELETE FROM product_attribution WHERE date < ?', [day(new Date(cutoff))]);
      database.run('DELETE FROM product_receipts WHERE expiresAt <= ?', [now.toISOString()]);
      database.run('DELETE FROM product_daily WHERE date < ?', [summary]);
      database.run('DELETE FROM product_cohorts WHERE period < ?', [summary]);
      database.run('DELETE FROM product_search_daily WHERE date < ?', [summary]);
      database.run(
        "INSERT INTO product_analytics_state (key,value) VALUES ('lastMaintenance',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [now.toISOString()],
      );
    })();
    return true;
  } catch {
    warn('maintenance');
    return false;
  }
}

export function startProductAnalyticsMaintenance() {
  if (!config.authRequired) return;
  maintainProductAnalytics();
  setInterval(() => maintainProductAnalytics(), 60 * 60_000).unref();
}

function legacyLookupCohort(database: Database, now: Date) {
  if (!database.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='user'").get())
    return null;
  const users = database
    .query(
      `SELECT id,email,createdAt FROM user WHERE date(createdAt) BETWEEN '2026-11-09' AND '2026-12-08'
     OR date(CAST(createdAt AS REAL)/1000,'unixepoch') BETWEEN '2026-11-09' AND '2026-12-08'`,
    )
    .all() as { id: string; email: string; createdAt: string | number }[];
  const check = database.query(
    'SELECT COUNT(DISTINCT date) AS days FROM dailyStats WHERE userId=? AND date BETWEEN ? AND ? AND dictionaryLookups>0',
  );
  const emails = excludedEmails();
  let eligible = 0;
  let returned = 0;
  for (const user of users) {
    if (emails.has(user.email.toLowerCase())) continue;
    const zone = getConfiguredTimeZone(user.id);
    const created = accountDate(user.createdAt);
    if (!created) continue;
    const joined = dateStringInTimeZone(created, zone);
    if (joined < '2026-11-10' || joined > '2026-12-07') continue;
    const last = addDaysToDateString(joined, 13);
    if (last >= dateStringInTimeZone(now, zone)) continue;
    eligible += 1;
    const row = check.get(user.id, joined, last) as { days: number };
    if (row.days >= 2) returned += 1;
  }
  return {
    from: '2026-11-10',
    to: '2026-12-07',
    eligible,
    returned,
    basis: 'learner_local_lookup_days',
  };
}

function cohortReport(database: Database, from: string, to: string): CohortRow[] {
  const rows = database
    .query(
      'SELECT period,source,metric,eligible,returned FROM product_cohorts WHERE period BETWEEN ? AND ? ORDER BY period,metric,source',
    )
    .all(`${from.slice(0, 7)}-01`, to) as CohortRow[];
  const grouped = new Map<string, CohortRow>();
  for (const row of rows) {
    const period = row.period.slice(0, 7);
    const key = JSON.stringify([period, row.metric, row.source]);
    const total = grouped.get(key);
    if (total) {
      total.eligible += row.eligible;
      total.returned += row.returned;
    } else grouped.set(key, { ...row, period });
  }
  const safe = new Map<string, CohortRow>();
  for (const row of grouped.values()) {
    const source = row.eligible >= 5 ? row.source : 'other';
    const key = JSON.stringify([row.period, row.metric, source]);
    const total = safe.get(key);
    if (total) {
      total.eligible += row.eligible;
      total.returned += row.returned;
    } else safe.set(key, { ...row, source });
  }
  return [...safe.values()].filter((row) => row.eligible >= 5);
}

export function productAnalyticsReport(days: number, now = new Date(), database: Database = db) {
  const to = day(now);
  const from = addDaysToDateString(to, 1 - days);
  const daily = database
    .query(
      'SELECT * FROM product_daily WHERE date BETWEEN ? AND ? ORDER BY date DESC,event,dimensions LIMIT ?',
    )
    .all(from, to, MAX_REPORT_ROWS + 1) as DailyRow[];
  const search = database
    .query(
      'SELECT source,date,page,query,clicks,impressions FROM product_search_daily WHERE date BETWEEN ? AND ? ORDER BY date DESC,source,page,query LIMIT ?',
    )
    .all(from, to, MAX_REPORT_ROWS + 1);
  const truncated = {
    daily: daily.length > MAX_REPORT_ROWS,
    search: search.length > MAX_REPORT_ROWS,
  };
  return {
    from,
    to,
    environment: environment(),
    coverageStart: state(database, 'coverageStart'),
    lastMaintenance: state(database, 'lastMaintenance'),
    writeFailuresSinceStart: failures,
    daily: daily
      .slice(0, MAX_REPORT_ROWS)
      .map((row) => ({ ...row, dimensions: JSON.parse(row.dimensions) as Dimensions })),
    cohorts: cohortReport(database, from, to),
    legacyLookupCohort: legacyLookupCohort(database, now),
    search: search.slice(0, MAX_REPORT_ROWS),
    truncated,
  };
}
