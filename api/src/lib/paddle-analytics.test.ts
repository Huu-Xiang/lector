import '../test-guard';
import { afterEach, expect, test } from 'bun:test';
import { db } from '../db';
import { recordPaddleAnalytics } from './paddle-analytics';

const userId = 'paddle-analytics-fixture';
const date = '2026-11-03';
const occurred_at = `${date}T16:00:00.000Z`;

afterEach(() => {
  db.run('DELETE FROM product_events WHERE userId = ?', [userId]);
  db.run(
    "DELETE FROM product_daily WHERE date = ? AND json_extract(dimensions,'$.feature') = 'paddle'",
    [date],
  );
  db.run("DELETE FROM billing_subscriptions WHERE paddleSubscriptionId = 'sub_analytics'");
  db.run("DELETE FROM billing_customers WHERE paddleCustomerId LIKE 'ctm_analytics_fallback%'");
  db.run("DELETE FROM user WHERE id LIKE 'paddle-analytics-fallback-%'");
  db.run('DELETE FROM user WHERE id = ?', [userId]);
});

test('links Paddle customers through one verified matching email', () => {
  db.exec(
    `CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT,
      emailVerified INTEGER DEFAULT 0, twoFactorEnabled INTEGER DEFAULT 0,
      createdAt TEXT, updatedAt TEXT
    )`,
  );
  const customer = db.prepare(
    'INSERT INTO billing_customers (paddleCustomerId, email, occurredAt, updatedAt) VALUES (?, ?, ?, ?)',
  );
  const account = db.prepare(
    'INSERT INTO user (id, email, name, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const unique = 'paddle-analytics-fallback-verified';
  const unverified = 'paddle-analytics-fallback-unverified';
  customer.run(
    'ctm_analytics_fallback_verified',
    'paddle-fallback@example.test',
    occurred_at,
    occurred_at,
  );
  customer.run(
    'ctm_analytics_fallback_unverified',
    'paddle-unverified@example.test',
    occurred_at,
    occurred_at,
  );
  account.run(unique, 'Paddle-Fallback@example.test', 'Test', 1, occurred_at, occurred_at);
  account.run(unverified, 'paddle-unverified@example.test', 'Test', 0, occurred_at, occurred_at);

  function complete(id: string, customer_id: string) {
    recordPaddleAnalytics(
      {
        event_type: 'transaction.completed',
        occurred_at,
        data: {
          id,
          customer_id,
          status: 'completed',
          currency_code: 'USD',
          payments: [{ status: 'captured', amount: '1250' }],
        },
      },
      db,
    );
  }

  complete('txn_verified', 'ctm_analytics_fallback_verified');
  complete('txn_unverified', 'ctm_analytics_fallback_unverified');
  account.run(
    'paddle-analytics-fallback-ambiguous',
    'paddle-fallback@example.test',
    'Test',
    1,
    occurred_at,
    occurred_at,
  );
  complete('txn_ambiguous', 'ctm_analytics_fallback_verified');

  const events = db
    .query(
      "SELECT userId, dimensions FROM product_events WHERE userId LIKE 'paddle-analytics-fallback-%'",
    )
    .all() as { userId: string; dimensions: string }[];
  expect(events.map((event) => event.userId)).toEqual([unique]);
  expect(events[0].dimensions).not.toContain('@example.test');
});

test('aggregates verified captured payments and approved refunds once with currency', () => {
  db.exec(
    `CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT,
      emailVerified INTEGER DEFAULT 0, twoFactorEnabled INTEGER DEFAULT 0,
      createdAt TEXT, updatedAt TEXT
    )`,
  );
  db.run(
    'INSERT INTO user (id, email, name, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, 'paddle-analytics@example.test', 'Test', 1, occurred_at, occurred_at],
  );
  db.run(
    `INSERT INTO billing_subscriptions
       (paddleSubscriptionId, paddleCustomerId, userId, status, occurredAt, updatedAt)
     VALUES ('sub_analytics', 'ctm_analytics', ?, 'active', ?, ?)`,
    [userId, occurred_at, occurred_at],
  );
  const completed = {
    event_type: 'transaction.completed',
    occurred_at,
    data: {
      id: 'txn_paid',
      status: 'completed',
      currency_code: 'USD',
      custom_data: { lectorUserId: userId },
      payments: [
        { status: 'error', amount: '1250' },
        { status: 'captured', amount: '1250' },
      ],
    },
  };
  recordPaddleAnalytics(completed, db);
  recordPaddleAnalytics(completed, db);
  recordPaddleAnalytics(
    {
      ...completed,
      data: { ...completed.data, id: 'txn_zero', payments: [] },
    },
    db,
  );
  recordPaddleAnalytics(
    {
      ...completed,
      data: { ...completed.data, id: 'txn_unowned', custom_data: { lectorUserId: 'missing' } },
    },
    db,
  );

  const adjustment = {
    event_type: 'adjustment.created',
    occurred_at,
    data: {
      id: 'adj_partial',
      customer_id: 'ctm_analytics',
      subscription_id: 'sub_analytics',
      action: 'refund',
      currency_code: 'USD',
      totals: { total: '500' },
      status: 'approved',
    },
  };
  recordPaddleAnalytics(
    { ...adjustment, data: { ...adjustment.data, status: 'pending_approval' } },
    db,
  );
  recordPaddleAnalytics(adjustment, db);
  recordPaddleAnalytics({ ...adjustment, event_type: 'adjustment.updated' }, db);
  recordPaddleAnalytics(
    { ...adjustment, data: { ...adjustment.data, id: 'adj_other', customer_id: 'wrong' } },
    db,
  );

  const rows = db
    .prepare(
      `SELECT event, json_extract(dimensions, '$.step') AS currency, count, value
       FROM product_daily
      WHERE date = ? AND json_extract(dimensions, '$.feature') = 'paddle' ORDER BY event`,
    )
    .all(date);
  expect(rows).toEqual([
    { event: 'payment_refunded', currency: 'USD', count: 1, value: 500 },
    { event: 'payment_succeeded', currency: 'USD', count: 1, value: 1250 },
  ]);
  const events = db
    .prepare('SELECT eventKey, dimensions FROM product_events WHERE userId = ?')
    .all(userId);
  expect(events).toHaveLength(2);
  expect(JSON.stringify(events)).not.toContain('txn_paid');
  expect(JSON.stringify(events)).not.toContain('adj_partial');
});
