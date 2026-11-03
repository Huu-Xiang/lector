import '../test-guard';
import { afterEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { productEmailsEnabled, productEmailsSetting, setProductEmails } from './app-settings';

function freshDb(): Database {
  const database = new Database(':memory:');
  database.run(
    'CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updatedAt TEXT NOT NULL)',
  );
  return database;
}

const original = process.env.LIFECYCLE_EMAILS;
afterEach(() => {
  if (original === undefined) delete process.env.LIFECYCLE_EMAILS;
  else process.env.LIFECYCLE_EMAILS = original;
});

describe('product email switch', () => {
  test('follows LIFECYCLE_EMAILS until the admin sets it', () => {
    const database = freshDb();
    delete process.env.LIFECYCLE_EMAILS;
    expect(productEmailsSetting(database)).toEqual({ enabled: false, source: 'env' });
    process.env.LIFECYCLE_EMAILS = '1';
    expect(productEmailsSetting(database)).toEqual({ enabled: true, source: 'env' });
  });

  test('the admin value wins over the env and can be changed again', () => {
    const database = freshDb();
    process.env.LIFECYCLE_EMAILS = '1';
    setProductEmails(false, database);
    expect(productEmailsSetting(database)).toEqual({ enabled: false, source: 'admin' });
    setProductEmails(true, database);
    expect(productEmailsEnabled(database)).toBe(true);
  });
});
