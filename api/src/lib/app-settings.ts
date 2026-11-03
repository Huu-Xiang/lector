import { Database } from 'bun:sqlite';
import { db } from '../db';

const PRODUCT_EMAILS = 'productEmails';

/**
 * The switch for every lifecycle mail (welcome, reminders, limit notices).
 * Auth mail ignores it. The admin page sets it; until then LIFECYCLE_EMAILS=1
 * turns it on.
 */
export function productEmailsSetting(database: Database = db): {
  enabled: boolean;
  source: 'admin' | 'env';
} {
  const row = database
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(PRODUCT_EMAILS) as { value: string } | undefined;
  if (row) return { enabled: row.value === 'on', source: 'admin' };
  return { enabled: process.env.LIFECYCLE_EMAILS === '1', source: 'env' };
}

export function productEmailsEnabled(database: Database = db): boolean {
  return productEmailsSetting(database).enabled;
}

export function setProductEmails(enabled: boolean, database: Database = db): void {
  database
    .prepare(
      `INSERT INTO app_settings (key, value, updatedAt) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
    )
    .run(PRODUCT_EMAILS, enabled ? 'on' : 'off', new Date().toISOString());
}
