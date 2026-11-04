import '../../test-guard';
import { beforeEach, describe, expect, test } from 'bun:test';
import { db } from '../../db';
import { backfillWordCards } from './backfill';
import { buildRound, readLearnerLevel } from './queue';
import type { SentenceRequest } from './sentence-sources';

const NOW = Date.parse('2026-11-04T12:00:00Z');
const TS = '2026-01-01T00:00:00Z';

beforeEach(() => {
  for (const table of ['wordReviewLog', 'reviewRounds', 'wordCards', 'knownWords', 'vocab']) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
  db.prepare(
    "DELETE FROM settings WHERE key IN ('timezone','reviewGoal','readingLevels','nativeLanguage')",
  ).run();
});

function seedCard(stability: number, language = 'en') {
  db.prepare(
    `INSERT INTO vocab (id, text, type, sentence, translation, state, stateUpdatedAt, createdAt, language)
     VALUES ('v1', 'harbor', 'word', 'I like the harbor.', 'port', 'level1', ?, ?, ?)`,
  ).run(TS, TS, language);
  backfillWordCards('local', language, NOW);
  db.prepare(
    "UPDATE wordCards SET state = 'review', stability = ?, reps = 3, due = ? WHERE vocabId = 'v1'",
  ).run(stability, '2026-11-01T00:00:00Z');
}

const finder = (calls: SentenceRequest[]) => (req: SentenceRequest) => {
  calls.push(req);
  return {
    key: 'L:book:0:5',
    text: 'The ship left the harbor.',
    wordCount: 5,
    blank: { tokenStart: 4, tokenEnd: 5, start: 18, end: 24 },
    source: { kind: 'library' as const, bookSlug: 'book', bookTitle: 'Book', chapterTitle: '1' },
    translation: { text: 'x', lang: 'zh-CN' },
  };
};

const storedKey = () =>
  (
    db.prepare("SELECT lastSentenceKey AS k FROM wordCards WHERE vocabId = 'v1'").get() as {
      k: string | null;
    }
  ).k;

describe('buildRound sentences', () => {
  test('a fill-in item carries the found sentence, its source and blank, and stores the key', () => {
    seedCard(10);
    db.prepare(
      "INSERT INTO settings (userId, key, value) VALUES ('local', 'readingLevels', ?)",
    ).run(JSON.stringify({ en: 'B1' }));
    db.prepare(
      "INSERT INTO settings (userId, key, value) VALUES ('local', 'nativeLanguage', '\"zh-CN\"')",
    ).run();
    const calls: SentenceRequest[] = [];
    const [item] = buildRound('local', 'en', 5, NOW, () => null, finder(calls)).items;
    expect(item.questionType).toBe('fill_in');
    expect(item.sentence).toBe('The ship left the harbor.');
    expect(item.sentenceSource?.kind).toBe('library');
    expect(item.sentenceBlank).toEqual({ tokenStart: 4, tokenEnd: 5, start: 18, end: 24 });
    expect(item.sentenceTranslation).toEqual({ text: 'x', lang: 'zh-CN' });
    expect(item.example).toBeUndefined();
    expect(storedKey()).toBe('L:book:0:5');
    expect(calls[0]).toMatchObject({
      level: 'B1',
      savedSentence: 'I like the harbor.',
      skipSaved: false,
    });
    buildRound('local', 'en', 5, NOW, () => null, finder(calls));
    expect(calls[1].lastSentenceKey).toBe('L:book:0:5');
  });

  test('a recognition item gets an optional example and keeps its own sentence', () => {
    seedCard(2);
    const calls: SentenceRequest[] = [];
    const [item] = buildRound('local', 'en', 5, NOW, () => null, finder(calls)).items;
    expect(item.questionType).toBe('recognition');
    expect(item.sentence).toBe('I like the harbor.');
    expect(item.example?.source.kind).toBe('library');
    expect(item.sentenceSource).toBeUndefined();
    expect(calls[0].skipSaved).toBe(true);
  });

  test('a finder with nothing keeps the saved sentence and the stored key', () => {
    seedCard(10);
    const [item] = buildRound(
      'local',
      'en',
      5,
      NOW,
      () => null,
      () => null,
    ).items;
    expect(item.sentence).toBe('I like the harbor.');
    expect(item.sentenceSource).toBeUndefined();
    expect(storedKey()).toBeNull();
  });

  test('a choose-meaning item never asks the finder', () => {
    db.prepare(
      `INSERT INTO vocab (id, text, type, sentence, translation, state, stateUpdatedAt, createdAt, language)
       VALUES ('v1', 'harbor', 'word', 's', 'port', 'level1', ?, ?, 'en')`,
    ).run(TS, TS);
    for (const [i, meaning] of ['cat', 'dog', 'horse', 'bird'].entries()) {
      db.prepare(
        `INSERT INTO vocab (id, text, type, sentence, translation, state, stateUpdatedAt, createdAt, language)
         VALUES (?, ?, 'word', 's', ?, 'level1', ?, ?, 'en')`,
      ).run(`o${i}`, `w${i}`, meaning, TS, TS);
    }
    backfillWordCards('local', 'en', NOW);
    const calls: SentenceRequest[] = [];
    const { items } = buildRound('local', 'en', 5, NOW, () => null, finder(calls));
    expect(items.every((item) => item.questionType === 'choose_meaning')).toBe(true);
    expect(calls).toHaveLength(0);
  });

  test('readLearnerLevel reads the level of the language and ignores bad values', () => {
    expect(readLearnerLevel('local', 'en')).toBeNull();
    db.prepare(
      "INSERT INTO settings (userId, key, value) VALUES ('local', 'readingLevels', 'oops')",
    ).run();
    expect(readLearnerLevel('local', 'en')).toBeNull();
  });
});
