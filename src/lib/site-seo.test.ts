import { afterEach, describe, expect, it } from 'vitest';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { GET as getIndexNowKey } from '@/app/indexnow-key.txt/route';
import { isNoIndexSite, validIndexNowKey } from './site-seo';

const ORIGINAL_ENV = {
  READFOX_BETA_NOTICE: process.env.READFOX_BETA_NOTICE,
  READFOX_NOINDEX: process.env.READFOX_NOINDEX,
  INDEXNOW_KEY: process.env.INDEXNOW_KEY,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(restoreEnv);

describe('site-seo', () => {
  it('treats READFOX_BETA_NOTICE=1 or READFOX_NOINDEX=1 as noindex', () => {
    delete process.env.READFOX_BETA_NOTICE;
    delete process.env.READFOX_NOINDEX;
    expect(isNoIndexSite()).toBe(false);

    process.env.READFOX_BETA_NOTICE = '1';
    expect(isNoIndexSite()).toBe(true);

    delete process.env.READFOX_BETA_NOTICE;
    process.env.READFOX_NOINDEX = '1';
    expect(isNoIndexSite()).toBe(true);
  });

  it('validates IndexNow keys per protocol character and length rules', () => {
    expect(validIndexNowKey(undefined)).toBeNull();
    expect(validIndexNowKey('short')).toBeNull();
    expect(validIndexNowKey('bad key with spaces')).toBeNull();
    expect(validIndexNowKey('../etc/passwd')).toBeNull();
    expect(validIndexNowKey('abcd1234-ef56-7890')).toBe('abcd1234-ef56-7890');
  });

  it('blocks all crawlers in robots.ts on test/noindex deployments', () => {
    process.env.READFOX_BETA_NOTICE = '1';
    const result = robots();
    expect(result).toEqual({
      rules: [{ userAgent: '*', disallow: '/' }],
    });
  });

  it('allows public SEO routes and disallows app/admin routes on production', () => {
    delete process.env.READFOX_BETA_NOTICE;
    delete process.env.READFOX_NOINDEX;
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    expect(rules[0]?.allow).toContain('/vocab-test');
    expect(rules[0]?.allow).toContain('/alternatives');
    expect(rules[0]?.disallow).toEqual(
      expect.arrayContaining(['/api/', '/admin', '/checkout', '/claim-book', '/settings']),
    );
    expect(result.sitemap).toBe('https://readfox.app/sitemap.xml');
  });

  it('attaches lastModified to every sitemap entry without duplicate URLs', () => {
    const entries = sitemap();
    expect(entries.length).toBeGreaterThan(200);
    const urls = entries.map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const entry of entries) {
      expect(entry.lastModified).toBeTruthy();
    }
  });

  it('serves /indexnow-key.txt only when a valid INDEXNOW_KEY is configured on production', async () => {
    delete process.env.READFOX_BETA_NOTICE;
    delete process.env.READFOX_NOINDEX;
    delete process.env.INDEXNOW_KEY;
    expect((await getIndexNowKey()).status).toBe(404);

    process.env.INDEXNOW_KEY = 'invalid key!';
    expect((await getIndexNowKey()).status).toBe(404);

    process.env.INDEXNOW_KEY = 'rfx-indexnow-20261124-valid';
    const ok = await getIndexNowKey();
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toContain('text/plain');
    expect(await ok.text()).toBe('rfx-indexnow-20261124-valid');

    process.env.READFOX_BETA_NOTICE = '1';
    expect((await getIndexNowKey()).status).toBe(404);
  });
});
