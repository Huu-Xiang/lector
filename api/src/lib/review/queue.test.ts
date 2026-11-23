import '../../test-guard';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { db } from '../../db';
import { backfillWordCards } from './backfill';
import { buildRound, questionTypeFor } from './queue';

describe('questionTypeFor', () => {
  const base = { type: 'word', language: 'en', goal: 'recognize', reps: 0 } as const;

  test('follows the stage table for the Recognize goal', () => {
    expect(questionTypeFor({ ...base, stage: 'new' })).toBe('choose_meaning');
    expect(questionTypeFor({ ...base, stage: 'learning' })).toBe('recognition');
    expect(questionTypeFor({ ...base, stage: 'familiar' })).toBe('fill_in');
    expect(questionTypeFor({ ...base, stage: 'mastered' })).toBe('recognition');
  });

  test('Recognize and spell types the word, and alternates typing with dictation when audio exists', () => {
    const spell = { ...base, goal: 'recognize_spell' } as const;
    expect(questionTypeFor({ ...spell, stage: 'familiar' })).toBe('typed_fill_in');
    expect(questionTypeFor({ ...spell, stage: 'mastered', reps: 4 })).toBe('typed_fill_in');
    expect(questionTypeFor({ ...spell, stage: 'mastered', reps: 5 })).toBe('dictation');
    expect(questionTypeFor({ ...spell, stage: 'learning' })).toBe('recognition');
  });

  test('phrases, Chinese and Korean fall back to the recognition card', () => {
    const spell = { ...base, goal: 'recognize_spell' } as const;
    for (const stage of ['familiar', 'mastered'] as const) {
      expect(questionTypeFor({ ...spell, stage, type: 'phrase' })).toBe('recognition');
      expect(questionTypeFor({ ...spell, stage, language: 'zh' })).toBe('recognition');
      expect(questionTypeFor({ ...base, stage, language: 'ko' })).toBe('recognition');
    }
    expect(questionTypeFor({ ...base, stage: 'new', type: 'phrase' })).toBe('choose_meaning');
  });
});

describe('monolingual cards in Practice queue (U3 / R8)', () => {
  const NOW = Date.parse('2026-11-04T12:00:00Z');
  const TS = '2026-01-01T00:00:00Z';

  function clear() {
    for (const table of ['wordReviewLog', 'reviewRounds', 'wordCards', 'knownWords', 'vocab']) {
      db.prepare(`DELETE FROM ${table}`).run();
    }
    db.prepare(
      "DELETE FROM settings WHERE userId = 'local' AND key IN ('nativeLanguage','monolingualExplanations','reviewGoal')",
    ).run();
  }

  function setSetting(key: string, value: unknown) {
    db.prepare("DELETE FROM settings WHERE userId = 'local' AND key = ?").run(key);
    db.prepare("INSERT INTO settings (userId, key, value) VALUES ('local', ?, ?)").run(
      key,
      JSON.stringify(value),
    );
  }

  function seedVocab(
    id: string,
    text: string,
    translation: string,
    translationLang: string | null,
    language: string,
    translationSource: string | null = null,
  ) {
    db.prepare(
      `INSERT INTO vocab (id, text, type, sentence, translation, translationLang, translationSource, state, stateUpdatedAt, createdAt, language)
       VALUES (?, ?, 'word', ?, ?, ?, ?, 'level1', ?, ?, ?)`,
    ).run(
      id,
      text,
      `Context with ${text}.`,
      translation,
      translationLang,
      translationSource,
      TS,
      TS,
      language,
    );
  }

  beforeEach(clear);
  afterEach(clear);

  test('preserves saved monolingual meanings for nl, sv, zh regardless of toggle state', () => {
    setSetting('nativeLanguage', 'zh-CN');
    for (const [lang, word, monoGloss, nativeGloss] of [
      ['nl', 'huis', 'een gebouw om in te wonen', '房子'],
      ['sv', 'hus', 'en byggnad att bo i', '房子'],
      ['zh', '房子', '供人居住的建筑物', 'house'],
    ] as const) {
      clear();
      setSetting('nativeLanguage', lang === 'zh' ? 'en' : 'zh-CN');
      seedVocab('m1', word, monoGloss, lang, lang);
      // Toggle OFF: bilingual mode must NOT overwrite the monolingual card via fillMeaning or refresh.
      setSetting('monolingualExplanations', false);
      backfillWordCards('local', lang, NOW);
      const stale: Array<{ word: string }> = [];
      const items = buildRound(
        'local',
        lang,
        10,
        NOW,
        () => nativeGloss,
        undefined,
        undefined,
        (_u, targets) => {
          stale.push(...targets);
          return Promise.resolve();
        },
      ).items;
      expect(items).toHaveLength(1);
      expect(items[0].translation).toBe(monoGloss);
      expect(stale).toEqual([]);
      expect(db.prepare("SELECT translation, translationLang FROM vocab WHERE id = 'm1'").get()).toEqual({
        translation: monoGloss,
        translationLang: lang,
      });
    }
  });

  test('skips fillMeaning and meaning-refresh when monolingualExplanations is ON and keeps choice pools language-pure', () => {
    setSetting('nativeLanguage', 'zh-CN');
    setSetting('monolingualExplanations', true);
    seedVocab('f1', 'chat', 'petit félin domestique', 'fr', 'fr');
    seedVocab('b1', 'chien', '狗', 'zh-CN', 'fr');
    seedVocab('b2', 'cheval', '马', 'zh-CN', 'fr');
    seedVocab('b3', 'oiseau', '鸟', 'zh-CN', 'fr');
    seedVocab('b4', 'poisson', '鱼', 'zh-CN', 'fr');
    seedVocab('e1', 'vide', '', null, 'fr');
    seedVocab('s1', 'maison', 'house', 'en', 'fr');

    backfillWordCards('local', 'fr', NOW);
    const stale: Array<{ word: string }> = [];
    let fillCalls = 0;
    const items = buildRound(
      'local',
      'fr',
      20,
      NOW,
      () => {
        fillCalls++;
        return '不应该覆盖';
      },
      undefined,
      undefined,
      (_u, targets) => {
        stale.push(...targets);
        return Promise.resolve();
      },
    ).items;

    expect(fillCalls).toBe(0);
    expect(stale).toEqual([]);
    // Empty card is skipped without calling fillMeaning.
    expect(items.find((i) => i.word === 'vide')).toBeUndefined();
    // Single monolingual French card does not mix Chinese distractors into choose_meaning.
    const chat = items.find((i) => i.word === 'chat')!;
    expect(chat.translation).toBe('petit félin domestique');
    expect(chat.questionType).toBe('recognition');
    // Bilingual Chinese cards still get pure Chinese choices.
    const chien = items.find((i) => i.word === 'chien')!;
    expect(chien.questionType).toBe('choose_meaning');
    expect(chien.choices).toHaveLength(4);
    for (const choice of chien.choices!) {
      expect(choice).not.toBe('petit félin domestique');
    }
  });

  test('preserves intentionally saved English mono_dict definitions when monolingual mode is disabled (B2)', () => {
    setSetting('nativeLanguage', 'zh-CN');
    setSetting('monolingualExplanations', false);
    seedVocab('en-mono', 'harbor', 'a sheltered port for ships', 'en', 'en', 'mono_dict');
    seedVocab('en-legacy', 'cat', 'small feline', 'en', 'en', 'dictionary');
    backfillWordCards('local', 'en', NOW);

    const filled: string[] = [];
    const items = buildRound(
      'local',
      'en',
      10,
      NOW,
      (_userId, word) => {
        filled.push(word);
        return word === 'cat' ? '猫' : '港口';
      },
    ).items;

    // Legacy English fallback (`dictionary`) still localizes to Chinese; intentional `mono_dict` is preserved.
    expect(filled).toEqual(['cat']);
    const harbor = items.find((i) => i.word === 'harbor')!;
    expect(harbor.translation).toBe('a sheltered port for ships');
    expect(db.prepare("SELECT translation, translationLang, translationSource FROM vocab WHERE id = 'en-mono'").get()).toEqual({
      translation: 'a sheltered port for ships',
      translationLang: 'en',
      translationSource: 'mono_dict',
    });
    const cat = items.find((i) => i.word === 'cat')!;
    expect(cat.translation).toBe('猫');
  });
});
