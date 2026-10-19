import { randomUUID } from 'crypto';
import { db } from '../db';

export type GrantPlan = 'cloud' | 'plus' | 'max';

const RANK: Record<GrantPlan, number> = { cloud: 1, plus: 2, max: 3 };

export interface PlanGrant {
  id: string;
  plan: GrantPlan;
  startsAt: string;
  endsAt: string;
  source: string;
  ref: string;
}

function isGrantPlan(value: string): value is GrantPlan {
  return value === 'cloud' || value === 'plus' || value === 'max';
}

export function planRank(plan: GrantPlan): number {
  return RANK[plan];
}

/** Grants that cover `now` or start later, oldest first. */
export function currentGrants(userId: string, now: Date = new Date()): PlanGrant[] {
  return (
    db
      .prepare(
        `SELECT id, plan, startsAt, endsAt, source, ref FROM plan_grants
         WHERE userId = ? AND endsAt > ? ORDER BY startsAt`,
      )
      .all(userId, now.toISOString()) as PlanGrant[]
  ).filter((grant) => isGrantPlan(grant.plan));
}

/** The highest tier among grants active at `now`, with its last end date. */
export function activeGrant(
  userId: string,
  now: Date = new Date(),
): { plan: GrantPlan; endsAt: string } | null {
  const at = now.toISOString();
  let best: { plan: GrantPlan; endsAt: string } | null = null;
  for (const grant of currentGrants(userId, now)) {
    if (grant.startsAt > at) continue;
    if (!best || RANK[grant.plan] > RANK[best.plan]) {
      best = { plan: grant.plan, endsAt: grant.endsAt };
    } else if (grant.plan === best.plan && grant.endsAt > best.endsAt) {
      best.endsAt = grant.endsAt;
    }
  }
  // Back-to-back grants of the same tier read as one stretch.
  if (best) {
    for (const grant of currentGrants(userId, now)) {
      if (grant.plan === best.plan && grant.startsAt <= best.endsAt && grant.endsAt > best.endsAt) {
        best.endsAt = grant.endsAt;
      }
    }
  }
  return best;
}

export function addMonths(start: Date, months: number): Date {
  const end = new Date(start);
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(start.getUTCDate(), lastDay));
  return end;
}

/**
 * Grant `plan` for `months`. A grant of the same tier that is still running
 * is extended (the new period starts when it ends). Idempotent by `ref`.
 */
export function grantPlan(args: {
  userId: string;
  plan: GrantPlan;
  /** Length of the period: months, or days when `days` is given. */
  months?: number;
  days?: number;
  source: string;
  ref: string;
  now?: Date;
}): PlanGrant {
  const now = args.now ?? new Date();
  const existing = db
    .prepare('SELECT id, plan, startsAt, endsAt, source, ref FROM plan_grants WHERE ref = ?')
    .get(args.ref) as PlanGrant | undefined;
  if (existing) return existing;

  const sameTierEnd = currentGrants(args.userId, now)
    .filter((grant) => grant.plan === args.plan)
    .reduce<string | null>(
      (latest, grant) => (!latest || grant.endsAt > latest ? grant.endsAt : latest),
      null,
    );
  const start = sameTierEnd ? new Date(sameTierEnd) : now;
  const grant: PlanGrant = {
    id: randomUUID(),
    plan: args.plan,
    startsAt: start.toISOString(),
    endsAt: (args.days
      ? new Date(start.getTime() + args.days * 86_400_000)
      : addMonths(start, args.months ?? 1)
    ).toISOString(),
    source: args.source,
    ref: args.ref,
  };
  db.prepare(
    `INSERT INTO plan_grants (id, userId, plan, startsAt, endsAt, source, ref, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    grant.id,
    args.userId,
    grant.plan,
    grant.startsAt,
    grant.endsAt,
    grant.source,
    grant.ref,
    now.toISOString(),
  );
  return grant;
}

/** The tier each account holds through a grant right now, with the date it ends. */
export function activeGrantMap(
  now: Date = new Date(),
): Map<string, { plan: GrantPlan; endsAt: string }> {
  const at = now.toISOString();
  const rows = db
    .prepare(`SELECT userId, plan, endsAt FROM plan_grants WHERE startsAt <= ? AND endsAt > ?`)
    .all(at, at) as Array<{ userId: string; plan: string; endsAt: string }>;
  const best = new Map<string, { plan: GrantPlan; endsAt: string }>();
  for (const row of rows) {
    if (!isGrantPlan(row.plan)) continue;
    const held = best.get(row.userId);
    if (!held || RANK[row.plan] > RANK[held.plan]) {
      best.set(row.userId, { plan: row.plan, endsAt: row.endsAt });
    } else if (row.plan === held.plan && row.endsAt > held.endsAt) {
      held.endsAt = row.endsAt;
    }
  }
  return best;
}

/**
 * End every grant that is running or still to start, after a refund. The rows
 * stay, so a replayed order cannot grant again (`ref` is unique). Returns how many ended.
 */
export function endGrants(userId: string, now: Date = new Date()): number {
  const at = now.toISOString();
  db.prepare(
    `UPDATE plan_grants SET startsAt = ? WHERE userId = ? AND startsAt > ? AND endsAt > ?`,
  ).run(at, userId, at, at);
  return db
    .prepare(`UPDATE plan_grants SET endsAt = ? WHERE userId = ? AND endsAt > ?`)
    .run(at, userId, at).changes;
}

/** End the grant an order created (its `ref`), keeping the row so the order cannot grant again. */
export function endGrantByRef(ref: string, now: Date = new Date()): number {
  const at = now.toISOString();
  db.prepare(`UPDATE plan_grants SET startsAt = ? WHERE ref = ? AND startsAt > ?`).run(at, ref, at);
  return db
    .prepare(`UPDATE plan_grants SET endsAt = ? WHERE ref = ? AND endsAt > ?`)
    .run(at, ref, at).changes;
}
