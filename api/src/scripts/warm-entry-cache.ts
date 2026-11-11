/**
 * Fill the shared entry cache ahead of time with Chinese meanings for common
 * dictionary words.
 *
 *   bun run src/scripts/warm-entry-cache.ts translate <in.json> <out.jsonl> [--pair fr-zh|en-fr|en-zh|en-zh-tw|zh-es|zh-fr|ko-zh|zh-ko] [--task word-gloss|context-rich] [--concurrency 4]
 *   bun run src/scripts/warm-entry-cache.ts import <out.jsonl>... [--language fr] [--native zh-CN]
 *
 * `translate` asks the deployment's managed model, one word per request, and
 * appends only answers that pass the checks to <out.jsonl> as they arrive. Put the
 * file on the data volume: a deploy recreates the container and clears /tmp.
 * Running it again skips finished words. Words that fail go to <out>.failed.jsonl.
 * Input items: { word, senses: ["pos: English gloss", ...], freedict?, cfdict_candidates?, zh? }.
 */
import fs from 'fs';
import path from 'path';
import { completeJson, getProvider, type LLMTask } from '../lib/llm';
import { sharedEntryCache } from '../lib/entry-cache';

interface Item {
  word: string;
  senses: string[];
  freedict?: Array<{ pos: string; zh: string[] }>;
  cfdict_candidates?: string[];
  /** Chinese meanings of the same word (ECDICT), used as a hint for en-fr, en-zh and en-zh-tw. */
  zh?: string[];
}

/**
 * `fr-zh`: French words, Chinese meanings. `en-fr`: English words, French equivalents.
 * `zh-es` and `zh-fr`: Chinese words, Spanish or French equivalents of their English senses.
 * `ko-zh`: Korean words, Chinese meanings. `zh-ko`: Chinese words, Korean equivalents.
 * `en-zh` and `en-zh-tw`: English words, Simplified or Traditional (Taiwan) Chinese meanings.
 */
export type Pair = 'fr-zh' | 'en-fr' | 'en-zh' | 'en-zh-tw' | 'zh-es' | 'zh-fr' | 'ko-zh' | 'zh-ko';

// Characters found in only one script. Both strings are disjoint.
const TRADITIONAL_ONLY =
  '們這個來說時為與會學開關東車長馬風書請問點還從過讓麼對電話嗎樣見兒國後現實產將當總應該種動體機經師親歲邊夢聽識靜錢寫處買' +
  '賣貓鳥魚雞龍網傳覺習義樂區業連則導隨雖難願題顏飛飯餐館鐘鐵錯隊隻雙雲頭達發報壞寶幫帶幾張強歡決歷歸壓優場孫彈傷價億內兩劇' +
  '勞務勝醫華單南協參啟喬團園圖壇夠奧婦嬰嚴塊裡裏樓條構標檢楊檔歐殘氣濟溫滿漢潔瀏燈營爾爭獎環甚畢盡礎禮禱稱穩穿窮節簡紀約級' +
  '細終組結絕統綠維罰羅聖聲職聯肅脫臉臺興舉艱藝藥蘇號蟲裝襪覽觀訂計記訪設許訴診評詞詢試詳誤誰課談調論謝證譯護讀變貝財貨貧購' +
  '貴費資賓賽趕趙躍輕輛輩轉辦農遊運遠適選遲邁邏鄰醜釋針鈴銀銷鋼錄鎮閃閉間閒階際雜靈響頁頂項順預領頻顯飲餘驅驗髮鬆鬧鬱魯鮮鹽' +
  '麗黃';
const SIMPLIFIED_ONLY =
  '们这个来说时为与会学开关东车长马风书请问点还从过让么对电话吗样见儿国现实产将当总应该种动体机经师亲岁边梦听识静钱写处买卖' +
  '猫鸟鱼鸡龙网传觉习义乐区业连则导随虽难愿题颜飞饭馆钟铁错队双头达发报坏宝帮带几张强欢决历归压优场孙弹伤价亿内两剧劳务胜医' +
  '华单协参团园图坛够奥妇婴严块楼条构标检杨档欧残气济温满汉洁灯营尔争奖环毕尽础礼祷称稳穷节简纪约级细终组结绝统绿维罚罗圣声' +
  '职联脱脸兴举艰艺药苏号虫装袜览观订计记访设许诉诊评词询试详误谁课谈调论谢证译护读变贝财货贫购贵费资宾赛赶赵跃轻辆辈转办农' +
  '游运远适选迟';

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

/**
 * Checks a Chinese gloss for an English headword. A Latin word that is the headword, or
 * the base word of "plural of X", may stay in the gloss ("present 的复数").
 */
export function englishToChineseProblemWith(
  gloss: unknown,
  englishSense: string,
  headword: string,
  script: 'simplified' | 'traditional',
): string | null {
  if (typeof gloss !== 'string') return problemWith(gloss);
  const allowed = new Set([headword.toLowerCase()]);
  const base = englishSense.match(/\bof\s+([A-Za-z'-]+)/i);
  if (base) allowed.add(base[1].toLowerCase());
  const stripped = gloss.replace(/[A-Za-z'-]+/g, (w) => (allowed.has(w.toLowerCase()) ? '' : w));
  const problem = problemWith(stripped.trim() ? stripped : gloss);
  if (problem) return problem;
  const wrongScript = script === 'simplified' ? TRADITIONAL_ONLY : SIMPLIFIED_ONLY;
  if ([...gloss].some((ch) => wrongScript.includes(ch))) {
    return script === 'simplified'
      ? 'Traditional characters in gloss'
      : 'Simplified characters in gloss';
  }
  return null;
}

export function frenchProblemWith(gloss: unknown, englishSense: string): string | null {
  if (typeof gloss !== 'string' || !gloss.trim()) return 'empty gloss';
  if (gloss.length > 100) return 'gloss too long';
  if (/[\u3040-\u30ff\u3100-\u312f\u4e00-\u9fff]/.test(gloss))
    return 'Chinese or Japanese in gloss';
  if (!/[a-zA-ZÀ-ÿ]/.test(gloss)) return 'no letters in gloss';
  const plain = englishSense
    .replace(/^[^:]*:\s*/, '')
    .trim()
    .toLowerCase();
  if (plain.length > 25 && gloss.trim().toLowerCase() === plain) return 'English text copied';
  return null;
}

export function latinProblemWith(gloss: unknown, englishSense: string): string | null {
  if (typeof gloss !== 'string' || !gloss.trim()) return 'empty gloss';
  if (gloss.length > 120) return 'gloss too long';
  if (/[\u3040-\u30ff\u3100-\u312f]/.test(gloss)) return 'kana or bopomofo in gloss';
  if (!/[a-zA-ZÀ-ÿ]/.test(gloss)) return 'no letters in gloss';
  const plain = englishSense
    .replace(/^[^:]*:\s*/, '')
    .trim()
    .toLowerCase();
  if (plain.length > 25 && gloss.trim().toLowerCase() === plain) return 'English text copied';
  return null;
}

export function koreanProblemWith(gloss: unknown, englishSense: string): string | null {
  if (typeof gloss !== 'string' || !gloss.trim()) return 'empty gloss';
  if (gloss.length > 100) return 'gloss too long';
  if (/[\u3040-\u30ff\u3100-\u312f]/.test(gloss)) return 'kana or bopomofo in gloss';
  if (/[\u4e00-\u9fff]/.test(gloss) && !/[\u4e00-\u9fff]/.test(englishSense)) {
    return 'Han characters in gloss';
  }
  if (!/[가-힣]/.test(gloss)) return 'no Korean in gloss';
  const plain = englishSense
    .replace(/^[^:]*:\s*/, '')
    .trim()
    .toLowerCase();
  if (plain.length > 25 && gloss.trim().toLowerCase() === plain) return 'English text copied';
  return null;
}

export function checkAnswer(item: Item, glosses: unknown, pair: Pair = 'fr-zh'): string | null {
  if (!Array.isArray(glosses) || glosses.length !== item.senses.length) {
    return `expected ${item.senses.length} glosses`;
  }
  for (const [i, gloss] of glosses.entries()) {
    const problem =
      pair === 'en-fr'
        ? frenchProblemWith(gloss, item.senses[i])
        : pair === 'en-zh' || pair === 'en-zh-tw'
          ? englishToChineseProblemWith(
              gloss,
              item.senses[i],
              item.word,
              pair === 'en-zh' ? 'simplified' : 'traditional',
            )
          : pair === 'fr-zh' || pair === 'ko-zh'
            ? problemWith(gloss)
            : pair === 'zh-ko'
              ? koreanProblemWith(gloss, item.senses[i])
              : latinProblemWith(gloss, item.senses[i]);
    if (problem) return `${problem}: ${String(gloss).slice(0, 40)}`;
  }
  const distinctSenses = new Set(item.senses.map((s) => s.replace(/^[^:]*:\s*/, ''))).size;
  if (distinctSenses >= 3 && new Set(glosses as string[]).size < Math.ceil(distinctSenses / 3)) {
    return 'the same gloss is repeated for different senses';
  }
  return null;
}

const RULES_FR_ZH = `You translate dictionary meanings for a French dictionary used by Chinese learners of French.
For every English sense, write the Simplified Chinese gloss. Reply with ONLY JSON: {"glosses": ["<Chinese for sense 1>", ...]} with exactly one gloss per sense, in order.

Rules:
1. Short dictionary style, at most 60 characters. Give the 1 to 4 most common Chinese equivalents of THAT sense. Separate near-synonyms with "、" and different meanings with "；".
2. Different senses get different glosses that match their own English text. Do not repeat one gloss for all senses.
3. Do not repeat the part-of-speech label. No pinyin, no zhuyin, no English words, no explanations or examples.
4. An inflected form ("past participle of accepter", "first-person singular present indicative of avoir") is written as the French base word plus Chinese grammar terms, for example "accepter 的过去分词", "avoir 的直陈式现在时第一人称单数", "somme 的复数". Terms: 过去分词, 现在分词, 阴性, 阳性, 单数, 复数, 直陈式, 虚拟式, 条件式, 命令式, 简单过去时, 未完成过去时, 现在时, 将来时, 第一/第二/第三人称. A bare "inflection of X:" is "X 的变位形式". A letter of the alphabet is "法语字母 X".
5. "freedict" is a human translation of the French word (high trust): use it when it fits the sense. "cfdict_candidates" are noisy hints: use one only if it really matches that sense. Never invent a meaning that is not in the English sense. Name every meaning the English gloss lists.
6. Prefer common, natural modern Mandarin. For a rare technical or historical sense, give a short plain Chinese explanation, not a sound-alike transliteration.`;

const RULES_EN_FR = `You translate dictionary meanings for an English dictionary used by French learners of English.
For every English sense, write the French equivalent. Reply with ONLY JSON: {"glosses": ["<French for sense 1>", ...]} with exactly one gloss per sense, in order.

Rules:
1. Give short French equivalents, the way a bilingual dictionary does: one to four French words or a short phrase per meaning, at most 60 characters. Separate near-synonyms with ", " and clearly different meanings with " ; ". Never write a French definition or an explanation, even when the English sense is a long definition: give the French word(s) a bilingual dictionary would give (for example "the wife or widow of a king" becomes "reine, épouse du roi").
2. Different senses get different glosses that match their own English text. Do not repeat one gloss for all senses.
3. Do not repeat the part-of-speech label. No Chinese, no English sentences, no examples. Put a verb in the infinitive, a noun with its usual article only when the gender is unclear.
4. An inflected form ("plural of child", "past tense of go") is written as "pluriel de child", "passé de go" style: the English base word plus a short French grammar note.
5. "chinese_meanings" are human translations of the same English word into Chinese. Use them only to understand which meaning is meant. Never output Chinese.
6. Prefer common, natural modern French. Proper nouns: the usual French name.`;

const RULES_EN_ZH = `You translate dictionary meanings for an English dictionary used by Chinese learners of English.
For every English sense, write the Simplified Chinese equivalent. Reply with ONLY JSON: {"glosses": ["<Chinese for sense 1>", ...]} with exactly one gloss per sense, in order.

Rules:
1. Short dictionary style, at most 60 characters. Give the 1 to 4 most common Chinese equivalents of THAT sense, the way a bilingual dictionary does. Separate near-synonyms with "、" and different meanings with "；". Never write a long Chinese definition, even when the English sense is a long definition: give the Chinese word(s) a bilingual dictionary would give.
2. Different senses get different glosses that match their own English text. Do not repeat one gloss for all senses.
3. Do not repeat the part-of-speech label. No pinyin, no English words, no examples. Use Simplified characters only.
4. An inflected form ("plural of child", "past tense of go", "comparative of big") is written as the English base word plus a Chinese grammar term, for example "child 的复数", "go 的过去式", "big 的比较级". Terms: 复数, 过去式, 过去分词, 现在分词, 第三人称单数, 比较级, 最高级.
5. "chinese_meanings", when present, are human translations of the same English word. Use them to understand which meaning is meant. Never contradict them.
6. Prefer common, natural modern Mandarin. Proper nouns: the usual Chinese name. Never invent a meaning that is not in the English sense.`;

const RULES_EN_ZH_TW = `You translate dictionary meanings for an English dictionary used by Taiwanese learners of English.
For every English sense, write the Traditional Chinese equivalent in Taiwan usage. Reply with ONLY JSON: {"glosses": ["<Chinese for sense 1>", ...]} with exactly one gloss per sense, in order.

Rules:
1. Short dictionary style, at most 60 characters. Give the 1 to 4 most common Chinese equivalents of THAT sense, the way a bilingual dictionary does. Separate near-synonyms with "、" and different meanings with "；". Never write a long Chinese definition, even when the English sense is a long definition: give the Chinese word(s) a bilingual dictionary would give.
2. Different senses get different glosses that match their own English text. Do not repeat one gloss for all senses.
3. Do not repeat the part-of-speech label. No pinyin, no zhuyin, no English words, no examples. Use Traditional characters only. Never write Simplified characters.
4. Use Taiwan Mandarin words, not mainland words: 軟體 not 软件, 資訊 not 信息, 網路 not 网络, 程式 not 程序, 品質 not 质量, 影片 not 视频, 滑鼠 not 鼠标, 計程車 not 出租车, 馬鈴薯 not 土豆, 捷運 not 地铁, 便利商店 not 便利店, 印表機 not 打印机.
5. An inflected form ("plural of child", "past tense of go", "comparative of big") is written as the English base word plus a Chinese grammar term, for example "child 的複數", "go 的過去式", "big 的比較級". Terms: 複數, 過去式, 過去分詞, 現在分詞, 第三人稱單數, 比較級, 最高級.
6. "chinese_meanings", when present, are Simplified Chinese translations of the same English word. Use them only to understand which meaning is meant. Never copy them as Simplified text: rewrite in Traditional characters with Taiwan wording.
7. Prefer common, natural modern Taiwan Mandarin. Proper nouns: the usual Taiwan name. Never invent a meaning that is not in the English sense.`;

const RULES_KO_ZH = `You translate dictionary meanings for a Korean dictionary used by Chinese learners of Korean.
For every English sense, write the Simplified Chinese gloss. Reply with ONLY JSON: {"glosses": ["<Chinese for sense 1>", ...]} with exactly one gloss per sense, in order.

Rules:
1. Short dictionary style, at most 60 characters. Give the 1 to 4 most common Chinese equivalents of THAT sense. Separate near-synonyms with "、" and different meanings with "；".
2. Different senses get different glosses that match their own English text. Do not repeat one gloss for all senses.
3. Do not repeat the part-of-speech label. No pinyin, no romanization, no English words, no explanations or examples.
4. An inflected or particle-attached form ("polite present of 가다", "topic-marked form of 나") is written as the Korean base word plus Chinese grammar terms, for example "가다 的非格式体现在时", "나 的主题形式".
5. Never invent a meaning that is not in the English sense. Name every meaning the English gloss lists.
6. Prefer common, natural modern Mandarin. For a rare technical or historical sense, give a short plain Chinese explanation.`;

function rulesForChinese(target: 'Spanish' | 'French' | 'Korean'): string {
  return `You translate dictionary meanings for a Chinese dictionary used by ${target} learners of Chinese.
For every English sense, write the ${target} equivalent. Reply with ONLY JSON: {"glosses": ["<${target} for sense 1>", ...]} with exactly one gloss per sense, in order.

Rules:
1. Give short ${target} equivalents, the way a bilingual dictionary does: one to four words or a short phrase per meaning, at most 80 characters. Separate near-synonyms with ", " and clearly different meanings with " ; ". Never write a long definition, even when the English sense is one: give the word(s) a bilingual dictionary would give.
2. Different senses get different glosses that match their own English text. Do not repeat one gloss for all senses.
3. Do not repeat the part-of-speech label. No English sentences, no pinyin, no examples. ${
    target === 'Korean'
      ? 'Put a verb or adjective in the dictionary form that ends in 다. Write Hangul only: no romanization and no Chinese characters, not even in parentheses.'
      : 'Put a verb in the infinitive.'
  }
4. Keep Chinese characters that the English sense itself shows, such as a measure word in "(Classifier: 个)", and explain them in ${target}.
5. A grammar particle or function word gets a short plain ${target} explanation of what it does, for example "partícula de aspecto perfectivo" or "particule d'aspect accompli".
6. Prefer common, natural modern ${target}. Proper nouns: the usual ${target} name.`;
}

export function userPrompt(item: Item, feedback: string | null, pair: Pair): string {
  const payload =
    pair === 'en-fr' || pair === 'en-zh' || pair === 'en-zh-tw'
      ? { word: item.word, senses: item.senses, chinese_meanings: item.zh ?? [] }
      : pair === 'zh-es' || pair === 'zh-fr' || pair === 'zh-ko' || pair === 'ko-zh'
        ? { word: item.word, senses: item.senses }
        : {
            word: item.word,
            senses: item.senses,
            freedict: item.freedict ?? [],
            cfdict_candidates: item.cfdict_candidates ?? [],
          };
  const rules =
    pair === 'en-fr'
      ? RULES_EN_FR
      : pair === 'en-zh'
        ? RULES_EN_ZH
        : pair === 'en-zh-tw'
          ? RULES_EN_ZH_TW
          : pair === 'zh-es'
            ? rulesForChinese('Spanish')
            : pair === 'zh-fr'
              ? rulesForChinese('French')
              : pair === 'zh-ko'
                ? rulesForChinese('Korean')
                : pair === 'ko-zh'
                  ? RULES_KO_ZH
                  : RULES_FR_ZH;
  return `${rules}\n\nInput:\n${JSON.stringify(payload, null, 1)}${
    feedback ? `\n\nYour previous answer was rejected (${feedback}). Fix it.` : ''
  }`;
}

function readRows(file: string): Array<{ word: string; glosses: string[] }> {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) return [];
  if (text.startsWith('[')) return JSON.parse(text);
  return text.split('\n').map((line) => JSON.parse(line));
}

/**
 * Appends each passing answer to `outFile` (one JSON object per line) as soon as it
 * arrives, and skips words already in the file, so an interrupted run resumes.
 */
async function translate(
  inFile: string,
  outFile: string,
  task: LLMTask,
  concurrency: number,
  pair: Pair,
) {
  const items = JSON.parse(fs.readFileSync(inFile, 'utf8')) as Item[];
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  const failedFile = outFile.replace(/\.jsonl?$/, '') + '.failed.jsonl';
  const done = new Set(readRows(outFile).map((row) => row.word));
  const todo = items.filter((item) => !done.has(item.word));
  const provider = getProvider('local', { byok: false });
  let next = 0;
  let passed = 0;
  let failed = 0;

  async function worker() {
    for (;;) {
      const index = next++;
      if (index >= todo.length) return;
      const item = todo[index];
      let feedback: string | null = null;
      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        try {
          const result = await completeJson<{ glosses?: unknown }>(provider, {
            messages: [{ role: 'user', content: userPrompt(item, feedback, pair) }],
            maxTokens: 900,
            task,
          });
          feedback = checkAnswer(item, result.glosses, pair);
          if (!feedback) {
            const glosses = (result.glosses as string[]).map((g) => g.trim());
            fs.appendFileSync(outFile, JSON.stringify({ word: item.word, glosses }) + '\n');
            ok = true;
          }
        } catch (error) {
          feedback = error instanceof Error ? error.message.slice(0, 80) : 'request failed';
        }
      }
      if (ok) passed++;
      else {
        failed++;
        fs.appendFileSync(failedFile, JSON.stringify({ word: item.word, reason: feedback }) + '\n');
      }
      if ((passed + failed) % 250 === 0) {
        console.log(`progress ${passed + failed}/${todo.length} (failed ${failed})`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log(
    `translated ${passed} of ${todo.length} new words (${done.size} already done); failed ${failed}`,
  );
}

function importFiles(files: string[], language: string, native: string) {
  let count = 0;
  for (const file of files) {
    for (const row of readRows(file)) {
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
      flag('pair', 'fr-zh') as Pair,
    );
  } else if (command === 'import' && files.length >= 1) {
    importFiles(files, flag('language', 'fr'), flag('native', 'zh-CN'));
  } else {
    console.error('usage: translate <in> <out> | import <out>...');
    process.exit(1);
  }
}
