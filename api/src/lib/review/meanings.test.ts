import '../../test-guard';
import { beforeEach, describe, expect, test } from 'bun:test';
import { db } from '../../db';
import { backfillWordCards } from './backfill';
import { foldMeaning, senseFromEntry } from './meanings';
import { buildRound } from './queue';

const NOW = Date.parse('2026-11-04T12:00:00Z');
const TS = '2026-01-01T00:00:00Z';

function clear() {
  for (const table of ['wordReviewLog', 'reviewRounds', 'wordCards', 'knownWords', 'vocab']) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
  db.prepare("DELETE FROM settings WHERE key IN ('timezone','reviewGoal')").run();
}

function seed(id: string, text: string, translation: string, language = 'en') {
  db.prepare(
    `INSERT INTO vocab (id, text, type, sentence, translation, state, stateUpdatedAt, createdAt, language)
     VALUES (?, ?, 'word', ?, ?, 'level1', ?, ?, ?)`,
  ).run(id, text, `A line with ${text}.`, translation, TS, TS, language);
}

function round(
  language = 'en',
  lookup: (u: string, w: string, l: string) => string | null = () => null,
) {
  backfillWordCards('local', language, NOW);
  return buildRound('local', language, 20, NOW, lookup).items;
}

beforeEach(clear);

describe('choices', () => {
  test('four options: the correct meaning once and three distinct others', () => {
    for (const [i, m] of ['cat', 'dog', 'horse', 'bird', 'fish'].entries())
      seed(`v${i}`, `w${i}`, m);
    const items = round();
    expect(items).toHaveLength(5);
    for (const item of items) {
      expect(item.questionType).toBe('choose_meaning');
      expect(item.choices).toHaveLength(4);
      expect(item.choices!.filter((c) => c === item.translation)).toHaveLength(1);
      expect(new Set(item.choices).size).toBe(4);
    }
  });

  test('meanings that differ only in case or trailing punctuation are not both offered', () => {
    seed('v0', 'a', 'the cat');
    seed('v1', 'b', 'The Cat.');
    seed('v2', 'c', 'the  cat!');
    seed('v3', 'd', 'a dog');
    seed('v4', 'e', 'a horse');
    seed('v5', 'f', 'a bird');
    const item = round().find((i) => i.word === 'a')!;
    expect(item.choices).toHaveLength(4);
    expect(item.choices!.map(foldMeaning).filter((c) => c === 'the cat')).toHaveLength(1);
  });

  test('AE11: with two saved words a New card is served as recognition', () => {
    seed('v0', 'chat', 'cat', 'fr');
    seed('v1', 'chien', 'dog', 'fr');
    const items = round('fr');
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.questionType).toBe('recognition');
      expect(item.choices).toBeUndefined();
    }
  });

  test('another language never supplies meanings', () => {
    seed('v0', 'chat', 'cat', 'fr');
    for (const [i, m] of ['dog', 'horse', 'bird', 'fish'].entries())
      seed(`e${i}`, `w${i}`, m, 'en');
    const [item] = round('fr');
    expect(item.questionType).toBe('recognition');
    const en = round('en');
    for (const i of en) {
      expect(i.choices).toHaveLength(4);
      expect(i.choices).not.toContain('cat');
    }
  });

  test('a case-only duplicate of the correct meaning is no distractor', () => {
    seed('v0', 'a', 'cat');
    seed('v1', 'b', 'Cat');
    seed('v2', 'c', 'dog');
    seed('v3', 'd', 'horse');
    const item = round().find((i) => i.word === 'a')!;
    expect(item.questionType).toBe('recognition');
  });
});

describe('empty meanings', () => {
  test('a dictionary sense fills the meaning, is stored and is offered', () => {
    seed('v0', 'run', '');
    seed('v1', 'b', 'dog');
    const items = round('en', (_u, word) => (word === 'run' ? 'move fast' : null));
    const run = items.find((i) => i.word === 'run')!;
    expect(run.translation).toBe('move fast');
    expect(db.prepare("SELECT translation FROM vocab WHERE id = 'v0'").get()).toEqual({
      translation: 'move fast',
    });
  });

  test('a card with no dictionary sense is not offered and stays empty', () => {
    seed('v0', 'zzz', '');
    seed('v1', 'b', 'dog');
    const items = round();
    expect(items.map((i) => i.word)).toEqual(['b']);
    expect(db.prepare("SELECT translation FROM vocab WHERE id = 'v0'").get()).toEqual({
      translation: '',
    });
  });

  test('a skipped card does not shrink a full round', () => {
    seed('v0', 'zzz', '');
    for (let i = 1; i <= 3; i++) seed(`v${i}`, `w${i}`, `m${i}`);
    backfillWordCards('local', 'en', NOW);
    expect(buildRound('local', 'en', 3, NOW, () => null).items).toHaveLength(3);
  });
});

describe('senseFromEntry', () => {
  const entry = (senses: string[], senseLanguage?: string) => ({
    word: 'x',
    senses: senses.map((gloss) => ({ partOfSpeech: 'n', gloss })),
    ...(senseLanguage ? { senseLanguage } : {}),
  });

  test('takes the first sense in the learner language', () => {
    expect(senseFromEntry(entry([' first ', 'second']), 'en')).toBe('first');
    expect(senseFromEntry(entry(['第一', '第二'], 'zh-CN'), 'zh-CN')).toBe('第一');
  });

  test('rejects senses written in another language or an empty entry', () => {
    expect(senseFromEntry(entry(['first']), 'zh-CN')).toBeNull();
    expect(senseFromEntry(entry(['第一'], 'zh-CN'), 'en')).toBeNull();
    expect(senseFromEntry(entry(['  ']), 'en')).toBeNull();
    expect(senseFromEntry(undefined, 'en')).toBeNull();
  });
});

describe('native-language meanings', () => {
  function setNative(code: string) {
    db.prepare("DELETE FROM settings WHERE key = 'nativeLanguage'").run();
    db.prepare(
      "INSERT INTO settings (userId, key, value) VALUES ('local', 'nativeLanguage', ?)",
    ).run(JSON.stringify(code));
  }
  const withLang = (id: string, lang: string | null) =>
    db.prepare('UPDATE vocab SET translationLang = ? WHERE id = ?').run(lang, id);
  const noRefresh = () => Promise.resolve();

  function seedMixed() {
    const english = ['cat', 'dog', 'horse', 'bird'];
    const japanese = ['猫', '犬', '馬', '鳥', '魚'];
    english.forEach((m, i) => seed(`e${i}`, `en${i}`, m));
    japanese.forEach((m, i) => seed(`j${i}`, `ja${i}`, m));
    english.forEach((_, i) => withLang(`e${i}`, 'en'));
    japanese.forEach((_, i) => withLang(`j${i}`, 'ja'));
    backfillWordCards('local', 'en', NOW);
  }

  test('with a Japanese learner, options are all Japanese and English cards get no choice', () => {
    setNative('ja');
    seedMixed();
    const stale: Array<{ word: string }> = [];
    const items = buildRound(
      'local',
      'en',
      20,
      NOW,
      () => null,
      undefined,
      undefined,
      (_u, t) => {
        stale.push(...t);
        return Promise.resolve();
      },
    ).items;
    expect(items).toHaveLength(9);
    for (const item of items) {
      if (item.word.startsWith('ja')) {
        expect(item.questionType).toBe('choose_meaning');
        expect(item.choices).toHaveLength(4);
        for (const choice of item.choices!) expect(/[぀-ヿ一-鿿]/.test(choice)).toBe(true);
      } else {
        expect(item.questionType).toBe('recognition');
        expect(item.choices).toBeUndefined();
      }
    }
    expect(stale.map((t) => t.word).sort()).toEqual(['en0', 'en1', 'en2', 'en3']);
  });

  test('legacy rows without a language are judged by script', () => {
    setNative('ja');
    seedMixed();
    for (const id of ['e0', 'e1', 'e2', 'e3', 'j0', 'j1', 'j2', 'j3', 'j4']) withLang(id, null);
    const items = buildRound(
      'local',
      'en',
      20,
      NOW,
      () => null,
      undefined,
      undefined,
      noRefresh,
    ).items;
    for (const item of items.filter((i) => i.questionType === 'choose_meaning')) {
      expect(item.word.startsWith('ja')).toBe(true);
      for (const choice of item.choices!) expect(/[぀-ヿ一-鿿]/.test(choice)).toBe(true);
    }
  });

  test('a free dictionary sense in the learner language replaces a mismatched meaning', () => {
    setNative('ja');
    seedMixed();
    const items = buildRound(
      'local',
      'en',
      20,
      NOW,
      (_u, word) => (word === 'en0' ? '猫だよ' : null),
      undefined,
      undefined,
      noRefresh,
    ).items;
    const item = items.find((i) => i.word === 'en0')!;
    expect(item.translation).toBe('猫だよ');
    expect(item.questionType).toBe('choose_meaning');
    expect(
      db.prepare("SELECT translation, translationLang FROM vocab WHERE id = 'e0'").get(),
    ).toEqual({ translation: '猫だよ', translationLang: 'ja' });
  });

  test('fillMeaning records the learner language', () => {
    setNative('zh-TW');
    seed('x', 'w', '', 'en');
    backfillWordCards('local', 'en', NOW);
    buildRound('local', 'en', 5, NOW, () => '貓', undefined, undefined, noRefresh);
    expect(db.prepare("SELECT translationLang FROM vocab WHERE id = 'x'").get()).toEqual({
      translationLang: 'zh-TW',
    });
  });
});
