import { describe, expect, test } from 'bun:test';
import { getLanguageConfig, stripMarkdown } from './languages';
import {
  searchLessonsInCorpus,
  windowSnippet,
  type SearchableLesson,
} from './lesson-search';

function makeLesson(overrides: Partial<SearchableLesson> = {}): SearchableLesson {
  return {
    id: 'lesson-1',
    title: 'Lesson 1',
    collectionId: 'col-1',
    collectionTitle: 'Collection 1',
    groupId: 'grp-1',
    groupName: 'News',
    textContent: '',
    sourceType: null,
    segments: null,
    segmentWords: null,
    ...overrides,
  };
}

describe('stripMarkdown (shared linear-time helper)', () => {
  test('drops heading lines by default (sentence-index compatibility) and keeps heading text when keepHeadings is true', () => {
    const md = '# Häuser am Fluss\n\nDie **Häuser** sind _groß_ und __alt__.\n\n---\n\n***\n\n> Ein Zitat\n- Ein Punkt';
    expect(stripMarkdown(md)).toBe('Die Häuser sind groß und alt.\n\nEin Zitat Ein Punkt');
    expect(stripMarkdown(md, { keepHeadings: true })).toBe(
      'Häuser am Fluss\n\nDie Häuser sind groß und alt.\n\nEin Zitat Ein Punkt',
    );
  });

  test('separates heading immediately followed by body line when keepHeadings is true', () => {
    const md = '# Häuser\nDie Häuser sind schön.';
    expect(stripMarkdown(md, { keepHeadings: true })).toBe('Häuser\n\nDie Häuser sind schön.');
  });

  test('strips link URLs and images while keeping link labels and preserving snake_case', () => {
    const md =
      'See [die Häuser](https://example.com/secret_url) and ![Häuser photo](https://example.com/häuser.png) with `code_var` and snake_case_id plus _emph_word_.';
    expect(stripMarkdown(md, { keepHeadings: true })).toBe(
      'See die Häuser and with code_var and snake_case_id plus emph_word.',
    );
  });

  test('handles pathological repeated underscores and brackets in linear time (< 50 ms)', () => {
    const evilUnderscores = '_'.repeat(50_000) + ' ' + '_a'.repeat(25_000);
    const evilBrackets = '![['.repeat(20_000) + ']';
    const start = performance.now();
    const out1 = stripMarkdown(evilUnderscores, { keepHeadings: true });
    const out2 = stripMarkdown(evilBrackets, { keepHeadings: true });
    const elapsed = performance.now() - start;

    expect(out1.length).toBeGreaterThan(0);
    expect(out2.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(50);
  });
});

describe('windowSnippet', () => {
  test('returns short sentences unchanged with original offsets', () => {
    const sentence = 'Die Häuser sind groß.';
    expect(windowSnippet(sentence, 4, 10, 300)).toEqual({
      snippet: sentence,
      matchStart: 4,
      matchEnd: 10,
    });
  });

  test('windows long punctuation-free text to <= 300 chars around the match with accurate offsets', () => {
    const prefix = 'a'.repeat(250);
    const target = 'Häuser';
    const suffix = 'b'.repeat(250);
    const sentence = `${prefix} ${target} ${suffix}`;
    const matchStart = prefix.length + 1;
    const matchEnd = matchStart + target.length;

    const result = windowSnippet(sentence, matchStart, matchEnd, 300);
    expect(result.snippet.length).toBeLessThanOrEqual(300);
    expect(result.snippet.startsWith('…')).toBe(true);
    expect(result.snippet.endsWith('…')).toBe(true);
    expect(result.snippet.slice(result.matchStart, result.matchEnd)).toBe('Häuser');
  });
});

describe('searchLessonsInCorpus', () => {
  test('matches German case/diacritic variants across headings and multi-line paragraphs (AE5)', () => {
    const de = getLanguageConfig('de');
    const lessons = [
      makeLesson({
        id: 'lesson-a',
        title: 'Kapitel 1',
        groupId: 'grp-news',
        groupName: 'News',
        textContent:
          '# Häuser\n\nAlte Häuser\nstehen am Fluss. Neue Autos fahren vorbei.\n\nAlte Häuser\nstehen am Fluss.',
      }),
      makeLesson({
        id: 'lesson-b',
        title: 'Kapitel 2',
        groupId: 'grp-fiction',
        groupName: 'Fiction',
        textContent: 'Wir sehen viele häuser in der Stadt.',
      }),
    ];

    const res = searchLessonsInCorpus(lessons, 'häuser', de);
    expect(res.truncated).toBe(false);
    expect(res.matches.map((m) => [m.lessonId, m.snippet, m.occ])).toEqual([
      ['lesson-a', 'Häuser', 0],
      ['lesson-a', 'Alte Häuser stehen am Fluss.', 0],
      ['lesson-a', 'Alte Häuser stehen am Fluss.', 1],
      ['lesson-b', 'Wir sehen viele häuser in der Stadt.', 0],
    ]);
    for (const m of res.matches) {
      expect(m.snippet.slice(m.matchStart, m.matchEnd).toLowerCase()).toBe('häuser');
    }
  });

  test('matches Cyrillic, Arabic tashkeel, Turkish dotted I, Latin macrons, Koine Greek, Italian elisions, and Korean clitics with zero pre-filter false negatives', () => {
    const ru = searchLessonsInCorpus(
      [makeLesson({ textContent: 'Вчера мы гуляли по Москва и видели друзей.' })],
      'москва',
      getLanguageConfig('ru'),
    );
    expect(ru.matches).toHaveLength(1);
    expect(ru.matches[0].snippet.slice(ru.matches[0].matchStart, ru.matches[0].matchEnd)).toBe(
      'Москва',
    );

    const ar = searchLessonsInCorpus(
      [makeLesson({ textContent: 'الطالب كَتَبَ رسالة طويلة.' })],
      'كتب',
      getLanguageConfig('ar'),
    );
    expect(ar.matches).toHaveLength(1);
    expect(ar.matches[0].snippet.slice(ar.matches[0].matchStart, ar.matches[0].matchEnd)).toBe(
      'كَتَبَ',
    );

    const tr = searchLessonsInCorpus(
      [makeLesson({ textContent: 'İstanbul çok güzel bir şehir.' })],
      'istanbul',
      getLanguageConfig('tr'),
    );
    expect(tr.matches).toHaveLength(1);
    expect(tr.matches[0].snippet.slice(tr.matches[0].matchStart, tr.matches[0].matchEnd)).toBe(
      'İstanbul',
    );

    const la = searchLessonsInCorpus(
      [makeLesson({ textContent: 'Debemus amāre patriam nostram.' })],
      'amare',
      getLanguageConfig('la'),
    );
    expect(la.matches).toHaveLength(1);
    expect(la.matches[0].snippet.slice(la.matches[0].matchStart, la.matches[0].matchEnd)).toBe(
      'amāre',
    );

    const grc = searchLessonsInCorpus(
      [makeLesson({ textContent: 'Ἐν ἀρχῇ ἦν ὁ λόγος.' })],
      'λογος',
      getLanguageConfig('grc'),
    );
    expect(grc.matches).toHaveLength(1);
    expect(grc.matches[0].snippet.slice(grc.matches[0].matchStart, grc.matches[0].matchEnd)).toBe(
      'λόγος',
    );

    const it = searchLessonsInCorpus(
      [makeLesson({ textContent: "Bevo l'acqua fresca ogni mattina." })],
      'acqua',
      getLanguageConfig('it'),
    );
    expect(it.matches).toHaveLength(1);

    const ko = searchLessonsInCorpus(
      [makeLesson({ textContent: '어제 도서관에서 책을 읽었어요.' })],
      '도서관',
      getLanguageConfig('ko'),
    );
    expect(ko.matches).toHaveLength(1);
  });

  test('matches CJK segmented words and phrases without false-matching sub-character fragments', () => {
    const zh = getLanguageConfig('zh');
    const lessons = [
      makeLesson({
        id: 'zh-1',
        textContent: '我**喜欢**读书。今天天气很好。',
        segmentWords: JSON.stringify(['喜欢', '读书', '今天', '天气', '很好']),
      }),
    ];

    const exact = searchLessonsInCorpus(lessons, '喜欢', zh);
    expect(exact.matches).toHaveLength(1);
    expect(exact.matches[0].snippet).toBe('我喜欢读书。');
    expect(
      exact.matches[0].snippet.slice(exact.matches[0].matchStart, exact.matches[0].matchEnd),
    ).toBe('喜欢');

    const phrase = searchLessonsInCorpus(lessons, '喜欢读书', zh);
    expect(phrase.matches).toHaveLength(1);
    expect(
      phrase.matches[0].snippet.slice(phrase.matches[0].matchStart, phrase.matches[0].matchEnd),
    ).toBe('喜欢读书');

    const fragment = searchLessonsInCorpus(lessons, '喜', zh);
    expect(fragment.matches).toHaveLength(0);
  });

  test('matches multi-word phrases across markdown emphasis and does not false-match URLs or images', () => {
    const en = getLanguageConfig('en');
    const lessons = [
      makeLesson({
        id: 'l-url',
        textContent:
          'Read [this article](https://example.com/secret-harbor) and ![secret harbor](https://example.com/pic.png).',
      }),
      makeLesson({
        id: 'l-phrase',
        textContent: 'The boat entered the **secret** *harbor* at dawn.',
      }),
    ];

    const res = searchLessonsInCorpus(lessons, 'secret harbor', en);
    expect(res.matches).toHaveLength(1);
    expect(res.matches[0].lessonId).toBe('l-phrase');
    expect(res.matches[0].snippet.slice(res.matches[0].matchStart, res.matches[0].matchEnd)).toBe(
      'secret harbor',
    );
  });

  test('extracts YouTube cue segmentIndex and startMs without leaking raw JSON markup', () => {
    const en = getLanguageConfig('en');
    const lessons = [
      makeLesson({
        id: 'yt-1',
        sourceType: 'youtube',
        textContent: 'Hello world\nWelcome to the harbor',
        segments: JSON.stringify([
          { start: 0, end: 2.5, text: 'Hello world' },
          { start: 12.4, end: 15.0, text: 'Welcome to the harbor' },
        ]),
      }),
    ];

    const res = searchLessonsInCorpus(lessons, 'harbor', en);
    expect(res.matches).toHaveLength(1);
    expect(res.matches[0]).toMatchObject({
      lessonId: 'yt-1',
      snippet: 'Welcome to the harbor',
      segmentIndex: 1,
      startMs: 12400,
    });
    expect(res.matches[0].snippet).not.toContain('{');
  });

  test('enforces perLessonCap, limit, maxScanMs, and maxScannedBytes with truncated flag', () => {
    const en = getLanguageConfig('en');
    const noisyLesson = makeLesson({
      id: 'noisy',
      textContent: Array.from({ length: 10 }, (_, i) => `Sentence ${i} has harbor inside.`).join(
        ' ',
      ),
    });
    const secondLesson = makeLesson({
      id: 'second',
      textContent: 'Another harbor appears here.',
    });

    const capped = searchLessonsInCorpus([noisyLesson, secondLesson], 'harbor', en, {
      perLessonCap: 3,
      limit: 50,
    });
    expect(capped.matches.filter((m) => m.lessonId === 'noisy')).toHaveLength(3);
    expect(capped.matches.filter((m) => m.lessonId === 'second')).toHaveLength(1);

    const limited = searchLessonsInCorpus([noisyLesson, secondLesson], 'harbor', en, {
      perLessonCap: 5,
      limit: 2,
    });
    expect(limited.matches).toHaveLength(2);
    expect(limited.truncated).toBe(true);

    let tick = 0;
    const timedOut = searchLessonsInCorpus([noisyLesson, secondLesson], 'harbor', en, {
      maxScanMs: 10,
      now: () => {
        const current = tick;
        tick += 20;
        return current;
      },
    });
    expect(timedOut.truncated).toBe(true);

    const byteCapped = searchLessonsInCorpus([noisyLesson, secondLesson], 'harbor', en, {
      maxScannedBytes: 310,
    });
    expect(byteCapped.matches.every((m) => m.lessonId === 'noisy')).toBe(true);
    expect(byteCapped.truncated).toBe(true);
  });
});
