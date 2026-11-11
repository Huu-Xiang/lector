# Warm cache: English to Chinese (zh-CN and zh-TW)

Run these steps on the server after the new image is deployed. Nothing here has run yet.
The commands call the paid managed model (step 4 and 6). Get the owner's approval first.

## Read this first: what the cache can hit

The lookup uses ECDICT's human Chinese meanings (`senses_i18n`, lang `zh-CN`) for any word that has them.
It then skips `/api/translate/localize`, so a warmed row for that word is never read.
Warmed rows help only English words with NO `senses_i18n` zh-CN rows.
`zh-TW` readers also get the Simplified ECDICT meanings today (`senseLanguageFor` maps every `zh*` to `zh-CN`).
So a zh-TW row is read only for words without ECDICT rows, unless that code changes.

Step 2 prints how many words are covered. If the missing set is small, the job is cheap and the gain is small.
The measured 2 s wait of English learners with Chinese as native language is not confirmed to come from this path.

## Files

| File | Where | Purpose |
| --- | --- | --- |
| `library-words.json` | owner machine (not in repo) | 70,747 distinct tokens of the 125 English books, with counts |
| `extract-library-words.py` | owner machine (not in repo) | rebuilds `library-words.json` from `languages/en/content/library` |
| `api/src/scripts/build-warm-input-en.ts` | repo | builds the input list from `dictionary-en.db` (read-only) |
| `api/src/scripts/warm-entry-cache.ts` | repo | `translate` and `import`, pairs `en-zh` and `en-zh-tw` |

Server paths: compose dir `/srv/lector`, data volume `/srv/lector/data` (container `/app/data`), dictionary in `/app/dict` (container volume `lector-dict`).
Keep all work files in `/srv/lector/data/warm/` (container `/app/data/warm/`). A deploy clears `/tmp`.

## 1. Copy the library list

```bash
ssh "$READFOX_HOST" 'mkdir -p /srv/lector/data/warm'
scp library-words.json "$READFOX_HOST":/srv/lector/data/warm/
```

## 2. Build the input (read-only on the dictionary)

```bash
cd /srv/lector
docker compose exec lector sh -c 'ls -la ${DICT_DIR:-/app/dict}/dictionary-en.db'
docker compose exec lector sh -c 'cd /app/api && bun run src/scripts/build-warm-input-en.ts \
  ${DICT_DIR:-/app/dict}/dictionary-en.db /app/data/warm/en-zh-input.json \
  --library /app/data/warm/library-words.json --top 10000'
```

If the script path differs in the image, run `docker compose exec lector sh -c 'find /app -name warm-entry-cache.ts'` and use that folder.

Output: one JSON line of stats and one line `senses N`.

- `topWords`: headwords taken by frequency rank. `libraryWords`: extra headwords found only in the books.
- `librarySkipped`: tokens that match no headword or form (names, foreign words, OCR noise). This is expected to be large.
- `union`: words before the filter. `covered`: words that have ECDICT Chinese (left out).
- `written`: words in `en-zh-input.json`. This is the number to translate.

Add `--include-covered` only if the owner wants AI meanings that replace nothing today. It also needs a code change before it has any effect.

Record the stats in the report to the owner.

## 3. Dry check of the input

```bash
docker compose exec lector sh -c 'cd /app/data/warm && head -c 600 en-zh-input.json; echo; \
  bun -e "const a=JSON.parse(require(\"fs\").readFileSync(\"en-zh-input.json\",\"utf8\"));console.log(a.length, a.reduce((n,i)=>n+i.senses.length,0), Math.max(...a.map(i=>i.senses.length)))"'
```

The three numbers are words, senses and the largest sense count (at most 12).

## 4. Translate to Simplified Chinese (paid, resumable)

Start with a small trial to read real output before the full run:

```bash
docker compose exec lector sh -c 'cd /app/api && bun -e "
const a=JSON.parse(require(\"fs\").readFileSync(\"/app/data/warm/en-zh-input.json\",\"utf8\"));
require(\"fs\").writeFileSync(\"/app/data/warm/en-zh-trial.json\",JSON.stringify(a.slice(0,40)))" && \
  bun run src/scripts/warm-entry-cache.ts translate /app/data/warm/en-zh-trial.json /app/data/warm/en-zh-trial.jsonl --pair en-zh --concurrency 4'
docker compose exec lector cat /app/data/warm/en-zh-trial.jsonl | head -20
```

Read the 40 lines. Check: short equivalents, no definitions, Simplified only, form words like "child 的复数".
If the quality is bad, stop. Do not run the full job.

Full run (survives a closed SSH session, resumes on rerun):

```bash
docker compose exec -d lector sh -c 'cd /app/api && bun run src/scripts/warm-entry-cache.ts translate \
  /app/data/warm/en-zh-input.json /app/data/warm/en-zh-CN.jsonl --pair en-zh --concurrency 4 \
  > /app/data/warm/en-zh-CN.log 2>&1'
docker compose exec lector tail -f /app/data/warm/en-zh-CN.log
```

Progress prints every 250 words. If the process stops, run the same command again: finished words are skipped.
A deploy or `docker compose up` restart kills the job. Run the same command after it.

## 5. Check counts and failures

```bash
docker compose exec lector sh -c 'cd /app/data/warm && wc -l en-zh-input.json en-zh-CN.jsonl en-zh-CN.failed.jsonl 2>&1; tail -3 en-zh-CN.log'
docker compose exec lector sh -c 'head -30 /app/data/warm/en-zh-CN.failed.jsonl'
```

Words in `en-zh-input.json` = lines in `.jsonl` + lines in `.failed.jsonl` (the input file is one JSON array, so count words with step 3).
The earlier runs lost about 0.1% of words, mostly function words. The localize route translates those on first lookup.
Stop and ask if more than 3% fail. Common causes are English words in the gloss or a wrong sense count.

## 6. Repeat for Traditional Chinese (only if the owner wants it)

zh-TW rows are read only for words without ECDICT rows, so this has the same small reach as step 4.

```bash
docker compose exec -d lector sh -c 'cd /app/api && bun run src/scripts/warm-entry-cache.ts translate \
  /app/data/warm/en-zh-input.json /app/data/warm/en-zh-TW.jsonl --pair en-zh-tw --concurrency 4 \
  > /app/data/warm/en-zh-TW.log 2>&1'
```

Run the trial first with `--pair en-zh-tw` and check for Taiwan wording (軟體, 影片, 滑鼠) and no Simplified characters.
Cheaper option with lower quality: convert the zh-CN file with OpenCC. It is not in the repo, so it needs a decision.

## 7. Import (retry on SQLITE_BUSY)

The import writes to `lector.db` while the app runs. Retry until it passes.

```bash
for i in 1 2 3 4 5 6 7 8; do
  docker compose exec lector sh -c 'cd /app/api && bun run src/scripts/warm-entry-cache.ts import \
    /app/data/warm/en-zh-CN.jsonl --language en --native zh-CN' && break
  echo "retry $i"; sleep 5
done
# only if step 6 ran
for i in 1 2 3 4 5 6 7 8; do
  docker compose exec lector sh -c 'cd /app/api && bun run src/scripts/warm-entry-cache.ts import \
    /app/data/warm/en-zh-TW.jsonl --language en --native zh-TW' && break
  echo "retry $i"; sleep 5
done
```

Expected line: `imported N entries into shared_entry_cache (en -> zh-CN)`. N equals the lines in the `.jsonl` file.
The import is safe to run twice (`INSERT OR REPLACE`). It resets `createdAt`, so rows expire 180 days after the last import.

## 8. Verify the hit rate

A row is read only when its gloss count equals the sense count the lookup returns. This check does that without calling the model and without changing `hits`.

```bash
docker compose exec lector sh -c 'cd /app/api && bun -e "
import { Database } from \"bun:sqlite\";
const fs = require(\"fs\");
const db = new Database(\"/app/data/lector.db\", { readonly: true });
const items = JSON.parse(fs.readFileSync(\"/app/data/warm/en-zh-input.json\", \"utf8\"));
for (const native of [\"zh-CN\", \"zh-TW\"]) {
  const get = db.prepare(\"SELECT glosses FROM shared_entry_cache WHERE language=\x27en\x27 AND nativeLanguage=? AND word=? AND promptVersion=1\");
  let hit = 0, wrongCount = 0, missing = 0;
  for (const it of items) {
    const row = get.get(native, it.word.toLowerCase());
    if (!row) missing++;
    else if (JSON.parse(row.glosses).length === it.senses.length) hit++;
    else wrongCount++;
  }
  console.log(native, { words: items.length, hit, wrongCount, missing });
}"'
```

`hit` should be near the number of imported words. `wrongCount` must be 0.
Then test one word by hand in the app with a zh-CN account that has no ECDICT row for it: the drawer should fill at once and the log should show a localize `hit` (`[ai-timing]` or the lookup outcome counter).

## Cost estimate

The French run (10,000 words, about 21,000 senses, Qwen Flash, one word per request) cost under about 2 US dollars.
An English word has 1 to 8 senses and the prompt is similar in size, so budget about 0.2 US dollars per 1,000 words.

- Full 10,000 words: about 2 US dollars for zh-CN, the same again for zh-TW.
- The real count is the `written` number of step 2. If the covered words are left out, expect far fewer.
- Retries (up to 3 per word) add a few percent. Read the real spend in the provider console after the trial run: 40 words give the per-word price.

## Cautions

- Do not change `ENTRY_PROMPT_VERSION`. It orphans every warmed row, French ones included.
- Never run `translate` and `import` with the wrong `--native`: zh-TW glosses under `zh-CN` would reach Simplified readers.
- Rows older than 180 days are ignored. Plan a rerun in about 5 months.
- No Claude subagent bulk translation. Use only this script.
