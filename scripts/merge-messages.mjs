// Merges messages/src/<locale>/*.json into messages/<locale>.json.
// Usage: node scripts/merge-messages.mjs [--check]
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import uiLocales from '../src/i18n/ui-locales.json' with { type: 'json' };

const root = join(process.cwd(), 'messages');
const check = process.argv.includes('--check');
let stale = false;

function merge(target, source, path, file) {
  for (const [key, value] of Object.entries(source)) {
    const here = path ? `${path}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      if (typeof target[key] === 'string')
        throw new Error(`${file}: ${here} is a string elsewhere`);
      merge((target[key] ??= {}), value, here, file);
    } else {
      if (key in target) throw new Error(`${file}: duplicate key ${here}`);
      target[key] = value;
    }
  }
}

const catalogs = uiLocales.map(({ code: locale }) => {
  const dir = join(root, 'src', locale);
  const files = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .sort()
    : [];
  if (files.length === 0) throw new Error(`messages/src/${locale} has no catalog fragments`);

  const out = {};
  for (const file of files) {
    merge(out, JSON.parse(readFileSync(join(dir, file), 'utf8')), '', `${locale}/${file}`);
  }
  return { locale, text: `${JSON.stringify(out, null, 2)}\n` };
});

for (const { locale, text } of catalogs) {
  const target = join(root, `${locale}.json`);
  if (check) {
    if (!existsSync(target) || readFileSync(target, 'utf8') !== text) {
      console.error(`messages/${locale}.json is out of date; run node scripts/merge-messages.mjs`);
      stale = true;
    }
  } else {
    writeFileSync(target, text);
  }
}
if (stale) process.exit(1);
