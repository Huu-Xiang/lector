import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UI_LOCALES } from './locales';
import { APP_ONLY_NAMESPACES, pickMessages, SHELL_AND_PUBLIC_NAMESPACES } from './namespaces';

type Tree = { [key: string]: string | Tree };

function load(code: string): Tree {
  return JSON.parse(readFileSync(join(process.cwd(), 'messages', `${code}.json`), 'utf8')) as Tree;
}

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

/** ICU arguments and rich-text tags that a translation must keep. */
function placeholders(message: string): string[] {
  const args = [...message.matchAll(/\{(\w+)/g)].map((m) => `{${m[1]}}`);
  const tags = [...message.matchAll(/<(\w+)>/g)].map((m) => `<${m[1]}>`);
  return [...new Set([...args, ...tags])].sort();
}

const english = flatten(load('en'));

describe('message catalogs', () => {
  for (const { code } of UI_LOCALES.filter((l) => l.code !== 'en')) {
    describe(code, () => {
      const messages = flatten(load(code));

      it('has exactly the keys of the English catalog', () => {
        const missing = [...english.keys()].filter((k) => !messages.has(k));
        const extra = [...messages.keys()].filter((k) => !english.has(k));
        expect({ missing, extra }).toEqual({ missing: [], extra: [] });
      });

      it('has no empty translations', () => {
        expect([...messages].filter(([, v]) => v.trim() === '').map(([k]) => k)).toEqual([]);
      });

      it('keeps every placeholder and rich-text tag', () => {
        const broken = [...english].filter(
          ([key, text]) =>
            messages.has(key) &&
            JSON.stringify(placeholders(text)) !== JSON.stringify(placeholders(messages.get(key)!)),
        );
        expect(broken.map(([key]) => key)).toEqual([]);
      });
    });
  }

  it('has no empty English strings', () => {
    expect([...english].filter(([, v]) => v.trim() === '').map(([k]) => k)).toEqual([]);
  });

  it('partitions all top-level namespaces cleanly between public/shell and app-only slices', () => {
    const enRoot = load('en');
    const enKeys = Object.keys(enRoot).sort();
    const publicSet = new Set<string>(SHELL_AND_PUBLIC_NAMESPACES);
    const appSet = new Set<string>(APP_ONLY_NAMESPACES);

    const overlap = [...publicSet].filter((k) => appSet.has(k));
    const combined = [...new Set([...publicSet, ...appSet])].sort();

    expect(overlap).toEqual([]);
    expect(combined).toEqual(enKeys);

    const fullBytes = Buffer.byteLength(JSON.stringify(enRoot), 'utf8');
    const publicBytes = Buffer.byteLength(
      JSON.stringify(pickMessages(enRoot, SHELL_AND_PUBLIC_NAMESPACES)),
      'utf8',
    );
    expect(publicBytes).toBeLessThan(fullBytes * 0.5);
  });
});
