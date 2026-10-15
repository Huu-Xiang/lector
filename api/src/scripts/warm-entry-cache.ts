/**
 * Fill the shared entry cache ahead of time with Chinese meanings for common
 * dictionary words.
 *
 *   bun run src/scripts/warm-entry-cache.ts translate <in.json> <out.json> [--task word-gloss|context-rich] [--concurrency 4]
 *   bun run src/scripts/warm-entry-cache.ts import <out.json>... [--language fr] [--native zh-CN]
 *
 * `translate` asks the deployment's managed model, one word per request, and
 * writes only answers that pass the checks. Words that fail go to <out>.failed.json.
 * Input items: { word, senses: ["pos: English gloss", ...], freedict?, cfdict_candidates? }.
 */
import fs from 'fs';
import { completeJson, getProvider, type LLMTask } from '../lib/llm';
import { sharedEntryCache } from '../lib/entry-cache';

interface Item {
  word: string;
  senses: string[];
  freedict?: Array<{ pos: string; zh: string[] }>;
  cfdict_candidates?: string[];
}

const ENGLISH_WORDS =
  /\b(the|of|and|to|used|with|for|before|is|from|letter|person|plural|singular|indicative|present|past|form|alternative|variant|spelling)\b/i;

export function problemWith(gloss: unknown): string | null {
  if (typeof gloss !== 'string' || !gloss.trim()) return 'empty gloss';
  if (gloss.length > 80) return 'gloss too long';
  if (!/[一-鿿]/.test(gloss)) return 'no Chinese in gloss';
  if (ENGLISH_WORDS.test(gloss)) return 'English words in gloss';
  if (/[㄀-ㄯ]/.test(gloss)) return 'bopomofo in gloss';
  return null;
}

export function checkAnswer(item: Item, glosses: unknown): string | null {
  if (!Array.isArray(glosses) || glosses.length !== item.senses.length) {
    return `expected ${item.senses.length} glosses`;
  }
  for (const gloss of glosses) {
    const problem = problemWith(gloss);
    if (problem) return `${problem}: ${String(gloss).slice(0, 40)}`;
  }
  const distinctSenses = new Set(item.senses.map((s) => s.replace(/^[^:]*:\s*/, ''))).size;
  if (distinctSenses >= 3 && new Set(glosses as string[]).size < Math.ceil(distinctSenses / 3)) {
    return 'the same gloss is repeated for different senses';
  }
  return null;
}

const RULES = `You translate dictionary meanings for a French dictionary used by Chinese learners of French.
For every English sense, write the Simplified Chinese gloss. Reply with ONLY JSON: {"glosses": ["<Chinese for sense 1>", ...]} with exactly one gloss per sense, in order.

Rules:
1. Short dictionary style, at most 60 characters. Give the 1 to 4 most common Chinese equivalents of THAT sense. Separate near-synonyms with "、" and different meanings with "；".
2. Different senses get different glosses that match their own English text. Do not repeat one gloss for all senses.
3. Do not repeat the part-of-speech label. No pinyin, no zhuyin, no English words, no explanations or examples.
4. An inflected form ("past participle of accepter", "first-person singular present indicative of avoir") is written as the French base word plus Chinese grammar terms, for example "accepter 的过去分词", "avoir 的直陈式现在时第一人称单数", "somme 的复数". Terms: 过去分词, 现在分词, 阴性, 阳性, 单数, 复数, 直陈式, 虚拟式, 条件式, 命令式, 简单过去时, 未完成过去时, 现在时, 将来时, 第一/第二/第三人称. A bare "inflection of X:" is "X 的变位形式". A letter of the alphabet is "法语字母 X".
5. "freedict" is a human translation of the French word (high trust): use it when it fits the sense. "cfdict_candidates" are noisy hints: use one only if it really matches that sense. Never invent a meaning that is not in the English sense. Name every meaning the English gloss lists.
6. Prefer common, natural modern Mandarin. For a rare technical or historical sense, give a short plain Chinese explanation, not a sound-alike transliteration.`;

function userPrompt(item: Item, feedback: string | null): string {
  const payload = {
    word: item.word,
    senses: item.senses,
    freedict: item.freedict ?? [],
    cfdict_candidates: item.cfdict_candidates ?? [],
  };
  return `${RULES}\n\nInput:\n${JSON.stringify(payload, null, 1)}${
    feedback ? `\n\nYour previous answer was rejected (${feedback}). Fix it.` : ''
  }`;
}

async function translate(inFile: string, outFile: string, task: LLMTask, concurrency: number) {
  const items = JSON.parse(fs.readFileSync(inFile, 'utf8')) as Item[];
  const provider = getProvider('local', { byok: false });
  const ok: Array<{ word: string; glosses: string[] }> = [];
  const failed: Array<{ word: string; reason: string }> = [];
  let next = 0;

  async function worker() {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      const item = items[index];
      let feedback: string | null = null;
      let done = false;
      for (let attempt = 0; attempt < 3 && !done; attempt++) {
        try {
          const result = await completeJson<{ glosses?: unknown }>(provider, {
            messages: [{ role: 'user', content: userPrompt(item, feedback) }],
            maxTokens: 900,
            task,
          });
          feedback = checkAnswer(item, result.glosses);
          if (!feedback) {
            ok.push({
              word: item.word,
              glosses: (result.glosses as string[]).map((g) => g.trim()),
            });
            done = true;
          }
        } catch (error) {
          feedback = error instanceof Error ? error.message.slice(0, 80) : 'request failed';
        }
      }
      if (!done) failed.push({ word: item.word, reason: feedback ?? 'unknown' });
      const finished = ok.length + failed.length;
      if (finished % 250 === 0)
        console.log(`progress ${finished}/${items.length} (failed ${failed.length})`);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  const order = new Map(items.map((item, i) => [item.word, i]));
  ok.sort((a, b) => order.get(a.word)! - order.get(b.word)!);
  fs.writeFileSync(outFile, JSON.stringify(ok));
  fs.writeFileSync(
    outFile.replace(/\.json$/, '') + '.failed.json',
    JSON.stringify(failed, null, 1),
  );
  console.log(`translated ${ok.length} of ${items.length}; failed ${failed.length}`);
}

function importFiles(files: string[], language: string, native: string) {
  let count = 0;
  for (const file of files) {
    for (const row of JSON.parse(fs.readFileSync(file, 'utf8')) as Array<{
      word: string;
      glosses: string[];
    }>) {
      sharedEntryCache.put(language, native, row.word, row.glosses);
      count++;
    }
  }
  console.log(`imported ${count} entries into shared_entry_cache (${language} -> ${native})`);
}

if (import.meta.main) {
  const [command, ...rest] = process.argv.slice(2);
  const flag = (name: string, fallback: string) => {
    const at = rest.indexOf(`--${name}`);
    return at >= 0 ? rest[at + 1] : fallback;
  };
  const files = rest.filter((arg, i) => !arg.startsWith('--') && !rest[i - 1]?.startsWith('--'));
  if (command === 'translate' && files.length === 2) {
    await translate(
      files[0],
      files[1],
      flag('task', 'word-gloss') as LLMTask,
      Number(flag('concurrency', '4')),
    );
  } else if (command === 'import' && files.length >= 1) {
    importFiles(files, flag('language', 'fr'), flag('native', 'zh-CN'));
  } else {
    console.error('usage: translate <in> <out> | import <out>...');
    process.exit(1);
  }
}
