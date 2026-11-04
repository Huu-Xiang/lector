import '../../test-guard';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { buildLibraryIndex, resetLibraryIndexes, type LibraryIndex } from './sentence-index';
import {
  findSentence,
  rankCandidates,
  type SentenceDeps,
  type SentenceRequest,
} from './sentence-sources';

const previousRoot = process.env.LIBRARY_CONTENT_ROOT;
let index: LibraryIndex;

beforeAll(async () => {
  process.env.LIBRARY_CONTENT_ROOT = path.resolve(
    import.meta.dir,
    '../../test-fixtures/library-content',
  );
  resetLibraryIndexes();
  index = (await buildLibraryIndex('en'))!;
});

afterAll(() => {
  resetLibraryIndexes();
  if (previousRoot === undefined) delete process.env.LIBRARY_CONTENT_ROOT;
  else process.env.LIBRARY_CONTENT_ROOT = previousRoot;
});

const FORMS: Record<string, string[]> = {
  harbor: ['harbors', 'harbored', 'harboring'],
};

function deps(over: Partial<SentenceDeps> = {}): SentenceDeps {
  return {
    forms: (word) => FORMS[word] ?? [],
    examples: () => [],
    bank: () => [],
    library: () => index,
    random: () => 0,
    ...over,
  };
}

function request(over: Partial<SentenceRequest> = {}): SentenceRequest {
  return {
    word: 'harbor',
    type: 'word',
    language: 'en',
    level: 'A2',
    savedSentence: 'I like the harbor.',
    lastSentenceKey: null,
    ...over,
  };
}

function seeded(): () => number {
  let state = 12345;
  return () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return state / 2 ** 32;
  };
}

function walk(req: SentenceRequest, d: SentenceDeps, steps: number) {
  const seen = [];
  let last = req.lastSentenceKey;
  const random = seeded();
  for (let i = 0; i < steps; i++) {
    const found = findSentence({ ...req, lastSentenceKey: last }, { ...d, random });
    seen.push(found);
    last = found?.key ?? null;
  }
  return seen;
}

describe('findSentence: matching', () => {
  test('harbor finds harbors and harbored sentences, and harbinger does not match', () => {
    const found = walk(request({ lastSentenceKey: 'saved', savedSentence: '' }), deps(), 40);
    const texts = new Set(found.map((f) => f!.text));
    expect(texts.has('Many old ships harbored rats in the dark corners of the port.')).toBe(true);
    expect(texts.has('The town harbors many secrets from visitors.')).toBe(true);
    expect(texts.has('The small boat stayed in the harbor all night.')).toBe(true);
    for (const text of texts) expect(text).not.toContain('harbinger');
    expect(found.every((f) => f!.source.kind === 'library')).toBe(true);
  });

  test('the blank covers the matched surface form', () => {
    const found = walk(request({ lastSentenceKey: 'saved', savedSentence: '' }), deps(), 20);
    for (const f of found) {
      const blank = f!.blank!;
      expect(f!.text.slice(blank.start, blank.end)).toMatch(/^harbor(s|ed)?$/);
      expect(blank.tokenEnd).toBe(blank.tokenStart + 1);
    }
  });

  test('harbinger matches only its own sentence', () => {
    const found = findSentence(
      request({ word: 'harbinger', lastSentenceKey: 'saved', savedSentence: '' }),
      deps(),
    )!;
    expect(found.text).toBe('The first snow was a harbinger of a long winter.');
  });

  test('a phrase matches exact consecutive tokens only', () => {
    const phrase = request({
      word: 'give up',
      type: 'phrase',
      lastSentenceKey: 'saved',
      savedSentence: '',
    });
    const found = walk(phrase, deps(), 20);
    const texts = new Set(found.map((f) => f!.text));
    expect(texts).toEqual(
      new Set([
        'She did not want to give up on her dream of the sea.',
        '"Do not give up the ship," he said.',
      ]),
    );
    const first = found[0]!;
    expect(first.text.slice(first.blank!.start, first.blank!.end)).toBe('give up');
    expect(first.blank!.tokenEnd - first.blank!.tokenStart).toBe(2);
  });

  test('gave up does not match the phrase give up', () => {
    const found = findSentence(
      request({ word: 'gave up', type: 'phrase', lastSentenceKey: 'saved', savedSentence: '' }),
      deps(),
    )!;
    expect(found.text).toBe('He gave up the fight at last.');
  });

  test('Chinese and Korean skip the finder', () => {
    for (const language of ['zh', 'ko']) {
      expect(findSentence(request({ language }), deps())).toBeNull();
    }
  });
});

describe('findSentence: rotation and fallback', () => {
  test('AE8: two fetches in a row return different library sentences with their book and chapter', () => {
    const req = request({ lastSentenceKey: 'saved' });
    const first = findSentence(req, deps())!;
    const second = findSentence({ ...req, lastSentenceKey: first.key }, deps())!;
    expect(first.source.kind).toBe('library');
    expect(second.source.kind).toBe('library');
    expect(second.key).not.toBe(first.key);
    expect(second.text).not.toBe(first.text);
    expect(first.source.bookTitle).toBeTruthy();
    expect(first.source.bookSlug).toBeTruthy();
    expect(first.source.chapterTitle).toBeTruthy();
  });

  test('a card never served a sentence starts with the learner’s own sentence', () => {
    const found = findSentence(request(), deps())!;
    expect(found.source.kind).toBe('saved');
    expect(found.key).toBe('saved');
    expect(found.text).toBe('I like the harbor.');
    expect(found.blank).toBeDefined();
  });

  test('after the saved sentence, a word with no library sentence gets Tatoeba, then the saved one again', () => {
    const req = request({
      word: 'quay',
      lastSentenceKey: 'saved',
      savedSentence: 'We sat on the quay.',
    });
    const withBank = deps({
      bank: () => [
        {
          id: 4242,
          text: 'The quay was empty.',
          translation: 'Le quai était vide.',
          clozeWord: 'quay',
        },
      ],
    });
    const tatoeba = findSentence(req, withBank)!;
    expect(tatoeba.source).toEqual({ kind: 'tatoeba', tatoebaId: 4242 });
    expect(tatoeba.translation).toEqual({ text: 'Le quai était vide.', lang: 'en' });
    expect(tatoeba.key).toBe('T:4242');
    const again = findSentence({ ...req, lastSentenceKey: 'saved' }, deps())!;
    expect(again.source.kind).toBe('saved');
    expect(again.text).toBe('We sat on the quay.');
    const afterTatoeba = findSentence({ ...req, lastSentenceKey: 'T:4242' }, withBank)!;
    expect(afterTatoeba.source.kind).toBe('saved');
  });

  test('dictionary examples are Tatoeba sentences found by their text', () => {
    const found = findSentence(
      request({ word: 'quay', lastSentenceKey: 'saved', savedSentence: '' }),
      deps({
        examples: () => [
          { text: 'No match here.' },
          { text: 'The quay was crowded.', translation: '码头很拥挤。', translationLang: 'zh-CN' },
        ],
      }),
    )!;
    expect(found.source).toEqual({ kind: 'tatoeba', tatoebaSearchText: 'The quay was crowded.' });
    expect(found.translation).toEqual({ text: '码头很拥挤。', lang: 'zh-CN' });
    expect(found.key).toMatch(/^E:/);
  });

  test('bank rows match through the inflection forms and skip mined rows', () => {
    const found = findSentence(
      request({ lastSentenceKey: 'saved', savedSentence: '', level: null }),
      deps({
        library: () => null,
        bank: () => [
          {
            id: 'mined-1',
            text: 'Mined harbors sentence.',
            translation: '',
            clozeWord: 'harbors',
            source: 'mined',
          },
          {
            id: 7,
            text: 'Ships fill the harbors every spring.',
            translation: 'x',
            clozeWord: 'harbors',
          },
        ],
      }),
    )!;
    expect(found.source).toEqual({ kind: 'tatoeba', tatoebaId: 7 });
  });

  test('with no sentence anywhere the saved sentence comes back even if it was last', () => {
    const found = findSentence(
      request({ word: 'quay', lastSentenceKey: 'saved', savedSentence: 'We sat on the quay.' }),
      deps(),
    )!;
    expect(found.key).toBe('saved');
    expect(findSentence(request({ word: 'quay', savedSentence: '' }), deps())).toBeNull();
  });

  test('skipSaved never returns the saved sentence', () => {
    expect(findSentence(request({ word: 'quay', skipSaved: true }), deps())).toBeNull();
    expect(findSentence(request({ skipSaved: true }), deps())!.source.kind).toBe('library');
  });

  test('a request during the build gets the next source without waiting', () => {
    const req = request({
      word: 'harbor',
      lastSentenceKey: 'saved',
      savedSentence: 'I like the harbor.',
    });
    const building = deps({
      library: () => null,
      bank: () => [{ id: 9, text: 'The harbor is calm.', translation: 'x', clozeWord: 'harbor' }],
    });
    expect(findSentence(req, building)!.source.kind).toBe('tatoeba');
    expect(findSentence(req, deps({ library: () => null }))!.source.kind).toBe('saved');
  });

  test('the library sentence that equals the saved sentence is not offered again', () => {
    const req = request({
      lastSentenceKey: 'saved',
      savedSentence: 'The small boat stayed in the harbor all night.',
    });
    const texts = walk(req, deps(), 30).map((f) => f!.text);
    expect(texts).not.toContain(req.savedSentence);
    expect(new Set(texts).size).toBeGreaterThan(1);
  });
});

describe('findSentence: ranking', () => {
  test('a sentence over 30 words is not served while shorter ones exist', () => {
    const found = walk(request({ lastSentenceKey: 'saved', savedSentence: '' }), deps(), 40);
    expect(found.every((f) => f!.wordCount <= 30)).toBe(true);
    expect(new Set(found.map((f) => f!.key)).size).toBeGreaterThan(2);
  });

  test('with equal length the book at the learner’s level comes first', () => {
    const a1 = findSentence(
      request({ level: 'A2', lastSentenceKey: 'saved', savedSentence: '' }),
      deps(),
    )!;
    const b2 = findSentence(
      request({ level: 'B2', lastSentenceKey: 'saved', savedSentence: '' }),
      deps(),
    )!;
    expect(a1.source.bookSlug).toBe('harbor-tales');
    expect(b2.source.bookSlug).toBe('sea-stories');
  });

  test('rankCandidates puts 6 to 18 words first, then level distance, then closeness to 12', () => {
    const c = (key: string, wordCount: number, levelDistance: number) => ({
      key,
      wordCount,
      levelDistance,
    });
    const ranked = rankCandidates([
      c('long', 40, 0),
      c('short', 3, 0),
      c('far', 10, 3),
      c('near-but-odd', 17, 0),
      c('near', 12, 0),
      c('mid-long', 25, 0),
    ]).map((x) => x.key);
    expect(ranked).toEqual(['near', 'near-but-odd', 'far', 'mid-long', 'short', 'long']);
  });
});
