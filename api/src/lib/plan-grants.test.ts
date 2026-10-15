import '../test-guard';
import { beforeEach, describe, expect, test } from 'bun:test';
import { db } from '../db';
import { activeGrant, grantPlan } from './plan-grants';

const NOW = new Date('2026-10-15T00:00:00Z');

beforeEach(() => {
  db.prepare("DELETE FROM plan_grants WHERE userId LIKE 'pg-%'").run();
});

describe('plan grants', () => {
  test('a second purchase of the same tier extends the first', () => {
    grantPlan({ userId: 'pg-a', plan: 'cloud', months: 1, source: 't', ref: 'pg-r1', now: NOW });
    const second = grantPlan({
      userId: 'pg-a',
      plan: 'cloud',
      months: 1,
      source: 't',
      ref: 'pg-r2',
      now: NOW,
    });
    expect(second.startsAt).toBe('2026-11-15T00:00:00.000Z');
    expect(activeGrant('pg-a', NOW)).toEqual({ plan: 'cloud', endsAt: '2026-12-15T00:00:00.000Z' });
  });

  test('the same ref grants once', () => {
    grantPlan({ userId: 'pg-b', plan: 'plus', months: 12, source: 't', ref: 'pg-r3', now: NOW });
    grantPlan({ userId: 'pg-b', plan: 'plus', months: 12, source: 't', ref: 'pg-r3', now: NOW });
    expect(activeGrant('pg-b', NOW)?.endsAt).toBe('2027-10-15T00:00:00.000Z');
  });

  test('the highest active tier wins, and an ended grant does not count', () => {
    grantPlan({ userId: 'pg-c', plan: 'cloud', months: 12, source: 't', ref: 'pg-r4', now: NOW });
    grantPlan({ userId: 'pg-c', plan: 'max', months: 1, source: 't', ref: 'pg-r5', now: NOW });
    expect(activeGrant('pg-c', NOW)?.plan).toBe('max');
    expect(activeGrant('pg-c', new Date('2026-12-01T00:00:00Z'))?.plan).toBe('cloud');
    expect(activeGrant('pg-c', new Date('2028-01-01T00:00:00Z'))).toBeNull();
  });
});
