// Merges messages/src/<locale>/*.json into messages/<locale>.json.
// Usage: node scripts/merge-messages.mjs [--check]
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'messages');
const check = process.argv.includes('--check');
let stale = false;

function merge(target, source, path, file) {
  for (const [key, value] of Object.entries(source)) {
    const here = path ? `${path}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      if (typeof target[key] === 'string') throw new Error(`${file}: ${here} is a string elsewhere`);
      merge((target[key] ??= {}), value, here, file);
    } else {
      if (key in target) throw new Error(`${file}: duplicate key ${here}`);
      target[key] = value;
    }
  }
}

for (const locale of readdirSync(join(root, 'src'))) {
  const dir = join(root, 'src', locale);
  const out = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    merge(out, JSON.parse(readFileSync(join(dir, file), 'utf8')), '', `${locale}/${file}`);
  }
  const text = `${JSON.stringify(out, null, 2)}\n`;
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
