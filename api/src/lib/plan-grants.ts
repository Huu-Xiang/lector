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

function addMonths(start: Date, months: number): Date {
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + months);
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
