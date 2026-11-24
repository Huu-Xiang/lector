#!/usr/bin/env node
/**
 * Submit production Readfox URLs to IndexNow (Bing / ChatGPT Search / Yandex).
 *
 * Refuses to run when READFOX_BETA_NOTICE=1, READFOX_NOINDEX=1, or the target
 * origin is not https://readfox.app so test/staging URLs are never pushed.
 *
 * Usage:
 *   INDEXNOW_KEY=<key> node scripts/push-indexnow.mjs [--dry-run] [url ...]
 */

const PRODUCTION_ORIGIN = 'https://readfox.app';
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run');
  const urls = argv.filter((arg) => !arg.startsWith('--'));
  return { dryRun, urls };
}

async function fetchSitemapUrls(origin) {
  const res = await fetch(`${origin}/sitemap.xml`);
  if (!res.ok) throw new Error(`Failed to fetch sitemap: HTTP ${res.status}`);
  const xml = await res.text();
  const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  return [...new Set(matches)].filter((u) => u.startsWith(`${origin}/`) || u === origin);
}

async function main() {
  if (process.env.READFOX_BETA_NOTICE === '1' || process.env.READFOX_NOINDEX === '1') {
    console.error('Refusing to submit IndexNow on a noindex/beta deployment.');
    process.exit(1);
  }
  const origin = (process.env.READFOX_SITE || PRODUCTION_ORIGIN).replace(/\/+$/, '');
  if (origin !== PRODUCTION_ORIGIN) {
    console.error(`Refusing to submit IndexNow for non-production origin: ${origin}`);
    process.exit(1);
  }
  const key = (process.env.INDEXNOW_KEY || '').trim();
  if (!KEY_PATTERN.test(key)) {
    console.error('Set a valid INDEXNOW_KEY (8-128 alphanumeric or hyphen characters).');
    process.exit(1);
  }

  const { dryRun, urls } = parseArgs(process.argv.slice(2));
  const urlList = urls.length > 0 ? urls : await fetchSitemapUrls(origin);
  if (urlList.length === 0) {
    console.error('No URLs found to submit.');
    process.exit(1);
  }
  for (const url of urlList) {
    if (!url.startsWith(`${origin}/`) && url !== origin) {
      console.error(`URL does not match ${origin}: ${url}`);
      process.exit(1);
    }
  }

  const payload = {
    host: new URL(origin).host,
    key,
    keyLocation: `${origin}/indexnow-key.txt`,
    urlList: urlList.slice(0, 10000),
  };

  if (dryRun) {
    console.log(
      JSON.stringify(
        { endpoint: INDEXNOW_ENDPOINT, count: payload.urlList.length, payload },
        null,
        2,
      ),
    );
    return;
  }

  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error(`IndexNow rejected submission: HTTP ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  console.log(`Submitted ${payload.urlList.length} URLs to IndexNow (HTTP ${res.status}).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
