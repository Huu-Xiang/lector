/**
 * Build the input file for `warm-entry-cache.ts translate --pair en-zh|en-zh-tw`.
 *
 *   bun run src/scripts/build-warm-input-en.ts <dictionary-en.db> <out.json> [--library library-words.json] [--top 10000] [--include-covered]
 *
 * Takes the `--top` most frequent headwords plus every library word that maps to a headword.
 * The dictionary is opened read-only. Without `--include-covered`, words that already
 * have ECDICT Chinese meanings are left out: the lookup serves those meanings, so a warmed
 * row for them is never read.
 * Library file: { words: [{ word, count, books }] } from the runbook's extract script.
 */
import { Database } from 'bun:sqlite';
import fs from 'fs';

export interface WarmItem {
  word: string;
  senses: string[];
  zh?: string[];
}

export interface BuildOptions {
  top: number;
  libraryWords: string[];
  includeCovered: boolean;
}

export interface BuildStats {
  topWords: number;
  libraryWords: number;
  librarySkipped: number;
  union: number;
  covered: number;
  written: number;
}

// Mirrors MAX_ENTRY_SENSES and MAX_ENTRY_GLOSS_CHARS: the cache row is read only when the
// sense count equals the count the lookup returns.
const MAX_SENSES = 12;
const MAX_GLOSS_CHARS = 300;

interface SenseRow {
  pos: string | null;
  gloss: string;
}

const senseLine = (row: SenseRow) =>
  (row.pos ? `${row.pos}: ${row.gloss}` : row.gloss).slice(0, MAX_GLOSS_CHARS);

export function buildWarmInput(
  db: Database,
  options: BuildOptions,
): { items: WarmItem[]; stats: BuildStats } {
  const hasSenses = db.prepare('SELECT 1 FROM senses WHERE word = ? LIMIT 1');
  const entryExists = db.prepare('SELECT 1 FROM entries WHERE word = ?');
  const lemmaOf = db.prepare(
    `SELECT i.lemma FROM inflections i LEFT JOIN entries e ON e.word = i.lemma
     WHERE i.inflected_form = ? ORDER BY e.rank IS NULL, e.rank LIMIT 1`,
  );
  const hasChinese = db.prepare(
    "SELECT 1 FROM senses_i18n WHERE word = ? AND lang = 'zh-CN' LIMIT 1",
  );
  const selectSenses = db.prepare(
    'SELECT pos, gloss FROM senses WHERE word = ? ORDER BY sort_order',
  );
  const selectChinese = db.prepare(
    "SELECT pos, gloss FROM senses_i18n WHERE word = ? AND lang = 'zh-CN' ORDER BY sort_order",
  );

  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (word: string) => {
    const key = word.toLowerCase();
    if (seen.has(key) || !hasSenses.get(word)) return false;
    seen.add(key);
    ordered.push(word);
    return true;
  };

  const top = db
    .prepare('SELECT word FROM entries WHERE rank IS NOT NULL ORDER BY rank, word LIMIT ?')
    .all(options.top) as Array<{ word: string }>;
  let topWords = 0;
  for (const row of top) if (add(row.word)) topWords++;

  let libraryWords = 0;
  let librarySkipped = 0;
  for (const token of options.libraryWords) {
    const direct = entryExists.get(token) ? token : null;
    const lemma = direct ?? (lemmaOf.get(token) as { lemma: string } | null)?.lemma ?? null;
    if (!lemma) librarySkipped++;
    else if (add(lemma)) libraryWords++;
  }

  const items: WarmItem[] = [];
  let covered = 0;
  for (const word of ordered) {
    const isCovered = Boolean(hasChinese.get(word));
    if (isCovered) covered++;
    if (isCovered && !options.includeCovered) continue;
    const senses = (selectSenses.all(word) as SenseRow[]).slice(0, MAX_SENSES).map(senseLine);
    const item: WarmItem = { word, senses };
    if (isCovered) item.zh = (selectChinese.all(word) as SenseRow[]).map(senseLine);
    items.push(item);
  }
  return {
    items,
    stats: {
      topWords,
      libraryWords,
      librarySkipped,
      union: ordered.length,
      covered,
      written: items.length,
    },
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const at = args.indexOf(`--${name}`);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const files = args.filter((arg, i) => !arg.startsWith('--') && !args[i - 1]?.startsWith('--'));
  if (files.length !== 2) {
    console.error(
      'usage: <dictionary-en.db> <out.json> [--library file] [--top N] [--include-covered]',
    );
    process.exit(1);
  }
  const libraryFile = flag('library');
  const libraryWords = libraryFile
    ? (JSON.parse(fs.readFileSync(libraryFile, 'utf8')).words as Array<{ word: string }>).map(
        (row) => row.word,
      )
    : [];
  const db = new Database(files[0], { readonly: true });
  const { items, stats } = buildWarmInput(db, {
    top: Number(flag('top') ?? '10000'),
    libraryWords,
    includeCovered: args.includes('--include-covered'),
  });
  fs.writeFileSync(files[1], JSON.stringify(items));
  console.log(JSON.stringify(stats));
  console.log(`senses ${items.reduce((n, item) => n + item.senses.length, 0)}`);
}
