import { db } from '../db';

export const TREND_RANGES = [7, 30, 90] as const;
export type TrendRange = (typeof TREND_RANGES)[number];

export interface TrendDay {
  date: string;
  signups: number;
  active: number;
  lookups: number;
  wordsSaved: number;
  practiced: number;
  minutesRead: number;
  freePhraseTranslations: number;
  freeContextTranslations: number;
  rmbOrders: number;
  rmbFen: number;
}

export interface AdminTrends {
  range: TrendRange;
  from: string;
  to: string;
  excludedAccounts: number;
  daily: TrendDay[];
  funnel: {
    signedUp: number;
    verified: number;
    finishedSetup: number;
    studied: number;
    finishedOnboarding: number;
    cameBack: number;
  };
  retention: {
    nextDay: { eligible: number; returned: number };
    afterWeek: { eligible: number; returned: number };
  };
  rmb: { orders: number; fen: number; refundedOrders: number; refundedFen: number };
}

const DAY_MS = 86_400_000;

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function addDays(day: string, n: number): string {
  return isoDay(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS);
}

// Better Auth writes createdAt as an ISO string; older rows can hold epoch milliseconds.
function signupDay(createdAt: string | number | null): string | null {
  if (createdAt === null || createdAt === '') return null;
  const ms = typeof createdAt === 'number' ? createdAt : Number(createdAt);
  const t = Number.isFinite(ms) ? ms : Date.parse(String(createdAt));
  return Number.isNaN(t) ? null : isoDay(t);
}

export function parseTrendRange(raw: string | undefined): TrendRange {
  const n = Number(raw);
  return (TREND_RANGES as readonly number[]).includes(n) ? (n as TrendRange) : 30;
}

/**
 * Service-wide daily totals for the admin dashboard. Signups, AI counters and
 * orders use UTC days; dailyStats rows use each learner's own time zone.
 */
export function buildAdminTrends(
  range: TrendRange,
  now: Date,
  excludeUserIds: ReadonlySet<string>,
): AdminTrends {
  const to = isoDay(now.getTime());
  const from = addDays(to, -(range - 1));
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const byDay = new Map<string, TrendDay>(
    days.map((date) => [
      date,
      {
        date,
        signups: 0,
        active: 0,
        lookups: 0,
        wordsSaved: 0,
        practiced: 0,
        minutesRead: 0,
        freePhraseTranslations: 0,
        freeContextTranslations: 0,
        rmbOrders: 0,
        rmbFen: 0,
      },
    ]),
  );
  const counted = (userId: string) => !excludeUserIds.has(userId);

  const users = (
    db.prepare('SELECT id, emailVerified, createdAt FROM user').all() as {
      id: string;
      emailVerified: number | null;
      createdAt: string | number | null;
    }[]
  ).filter((u) => counted(u.id));
  const knownUsers = new Set(users.map((u) => u.id));

  const activeDays = new Map<string, Set<string>>();
  const studyRows = db
    .prepare(
      `SELECT userId, date,
              SUM(dictionaryLookups) AS lookups, SUM(newWordsSaved) AS saved,
              SUM(clozePracticed) AS practiced, SUM(minutesRead) AS minutes
       FROM dailyStats
       WHERE sessionStartedAt IS NOT NULL
          OR wordsRead + newWordsSaved + wordsMarkedKnown + minutesRead
             + clozePracticed + dictionaryLookups + COALESCE(ankiReviews, 0) > 0
       GROUP BY userId, date`,
    )
    .all() as {
    userId: string;
    date: string;
    lookups: number;
    saved: number;
    practiced: number;
    minutes: number;
  }[];
  for (const row of studyRows) {
    if (!knownUsers.has(row.userId)) continue;
    let set = activeDays.get(row.userId);
    if (!set) {
      set = new Set();
      activeDays.set(row.userId, set);
    }
    set.add(row.date);
    const day = byDay.get(row.date);
    if (!day) continue;
    day.active += 1;
    day.lookups += row.lookups;
    day.wordsSaved += row.saved;
    day.practiced += row.practiced;
    day.minutesRead += row.minutes;
  }

  const hasCounters = Boolean(
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='usage_counters'").get(),
  );
  if (hasCounters) {
    const counters = db
      .prepare(
        `SELECT userId, metric, period, value FROM usage_counters
         WHERE metric IN ('phraseTranslationsPerDay', 'contextTranslationsPerDay')
           AND period >= ? AND period <= ?`,
      )
      .all(from, to) as { userId: string; metric: string; period: string; value: number }[];
    for (const row of counters) {
      const day = byDay.get(row.period);
      if (!day || !knownUsers.has(row.userId)) continue;
      if (row.metric === 'phraseTranslationsPerDay') day.freePhraseTranslations += row.value;
      else day.freeContextTranslations += row.value;
    }
  }

  const rmb = { orders: 0, fen: 0, refundedOrders: 0, refundedFen: 0 };
  const orders = db
    .prepare(
      `SELECT userId, status, amountFen, paidAt FROM cn_orders
       WHERE status IN ('SUCCEEDED', 'REFUNDED') AND paidAt IS NOT NULL`,
    )
    .all() as { userId: string; status: string; amountFen: number; paidAt: string }[];
  for (const order of orders) {
    if (!counted(order.userId)) continue;
    const day = byDay.get(order.paidAt.slice(0, 10));
    if (!day) continue;
    if (order.status === 'REFUNDED') {
      rmb.refundedOrders += 1;
      rmb.refundedFen += order.amountFen;
      continue;
    }
    day.rmbOrders += 1;
    day.rmbFen += order.amountFen;
    rmb.orders += 1;
    rmb.fen += order.amountFen;
  }

  const setupDone = new Set(
    (db.prepare('SELECT userId FROM onboarding_progress').all() as { userId: string }[]).map(
      (r) => r.userId,
    ),
  );
  const onboardingDone = new Set(
    (
      db.prepare("SELECT userId FROM onboarding_progress WHERE status = 'completed'").all() as {
        userId: string;
      }[]
    ).map((r) => r.userId),
  );

  const funnel = {
    signedUp: 0,
    verified: 0,
    finishedSetup: 0,
    studied: 0,
    finishedOnboarding: 0,
    cameBack: 0,
  };
  const retention = {
    nextDay: { eligible: 0, returned: 0 },
    afterWeek: { eligible: 0, returned: 0 },
  };
  for (const user of users) {
    const joined = signupDay(user.createdAt);
    if (!joined || joined < from || joined > to) continue;
    const day = byDay.get(joined);
    if (day) day.signups += 1;
    const studied = [...(activeDays.get(user.id) ?? [])];
    funnel.signedUp += 1;
    if (user.emailVerified === 1) funnel.verified += 1;
    if (setupDone.has(user.id)) funnel.finishedSetup += 1;
    if (studied.length > 0) funnel.studied += 1;
    if (onboardingDone.has(user.id)) funnel.finishedOnboarding += 1;
    if (studied.some((d) => d > joined)) funnel.cameBack += 1;

    const nextDay = addDays(joined, 1);
    if (nextDay < to) {
      retention.nextDay.eligible += 1;
      if (studied.includes(nextDay)) retention.nextDay.returned += 1;
    }
    const weekLater = addDays(joined, 7);
    if (weekLater <= to) {
      retention.afterWeek.eligible += 1;
      if (studied.some((d) => d >= weekLater)) retention.afterWeek.returned += 1;
    }
  }

  return {
    range,
    from,
    to,
    excludedAccounts: excludeUserIds.size,
    daily: days.map((d) => byDay.get(d)!),
    funnel,
    retention,
    rmb,
  };
}
