import { describe, expect, test } from 'vitest';
import { LANGUAGES } from '@/lib/languages';
import type { AudioTranscriptSegment } from '@/types';
import { chunkSentenceForSpeech, extractListenSentences } from './browser-tts-player';
import { activeSegmentIndex, formatClock, nextPlaybackRate, PLAYBACK_RATES } from './utils';

const SEGMENTS: AudioTranscriptSegment[] = [
  { idx: 0, startMs: 0, endMs: 2000, text: 'Een.' },
  { idx: 1, startMs: 2000, endMs: 4500, text: 'Twee.' },
  // Gap between 4500 and 5000 (silence in the recording).
  { idx: 2, startMs: 5000, endMs: 7000, text: 'Drie.' },
];

describe('activeSegmentIndex', () => {
  test('locates the segment containing the playhead', () => {
    expect(activeSegmentIndex(SEGMENTS, 0)).toBe(0);
    expect(activeSegmentIndex(SEGMENTS, 1999)).toBe(0);
    expect(activeSegmentIndex(SEGMENTS, 2000)).toBe(1);
    expect(activeSegmentIndex(SEGMENTS, 6500)).toBe(2);
  });

  test('keeps the last passed segment during a silence gap and past the end', () => {
    expect(activeSegmentIndex(SEGMENTS, 4700)).toBe(1);
    expect(activeSegmentIndex(SEGMENTS, 99000)).toBe(2);
  });

  test('is -1 before the first segment starts', () => {
    expect(activeSegmentIndex([{ idx: 0, startMs: 500, endMs: 900, text: 'x' }], 100)).toBe(-1);
    expect(activeSegmentIndex([], 0)).toBe(-1);
  });
});

describe('formatClock', () => {
  test('formats minutes and hours', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(83_000)).toBe('1:23');
    expect(formatClock(3_723_000)).toBe('1:02:03');
    expect(formatClock(-5)).toBe('0:00');
  });
});

describe('nextPlaybackRate', () => {
  test('cycles through the rate ladder and wraps', () => {
    expect(nextPlaybackRate(1)).toBe(1.25);
    expect(nextPlaybackRate(2)).toBe(0.5);
  });

  test('recovers to the start of the ladder from an unknown rate', () => {
    expect(nextPlaybackRate(3)).toBe(PLAYBACK_RATES[0]);
  });
});

describe('extractListenSentences', () => {
  test('keeps numbered headings intact and removes consecutive subset headings', () => {
    expect(
      extractListenSentences(
        '# 1. Chapter 1. Sara\n## Chapter 1. Sara\n\nSara reads. She smiles.',
        LANGUAGES.en,
      ),
    ).toEqual(['1. Chapter 1. Sara', 'Sara reads.', 'She smiles.']);
  });

  test('deduplicates identical headings but keeps headings separated by prose', () => {
    expect(
      extractListenSentences('# Sara\n\n## Sara\n\nShe reads.\n\n# Sara', LANGUAGES.en),
    ).toEqual(['Sara', 'She reads.', 'Sara']);
  });

  test('keeps distinct consecutive headings and prefers the more complete heading', () => {
    expect(
      extractListenSentences('# Sara\n## Chapter 1. Sara\n## Another chapter.', LANGUAGES.en),
    ).toEqual(['Chapter 1. Sara', 'Another chapter.']);
  });

  test('strips markdown headings, links, images, emphasis, and drops punctuation-only lines', () => {
    const md = [
      '# Chapitre 1 — *Le départ*',
      '',
      '![Illustration](https://example.com/pic.png)',
      '',
      'Bonjour **[tout le monde](https://example.com)** ! Comment _ça va_ aujourd’hui ?',
      '',
      '---',
      '',
      '...',
      '',
      '> Un petit pas.',
    ].join('\n');

    expect(extractListenSentences(md, LANGUAGES.fr)).toEqual([
      'Chapitre 1 — Le départ',
      'Bonjour tout le monde !',
      'Comment ça va aujourd’hui ?',
      'Un petit pas.',
    ]);
  });

  test('splits unspaced CJK paragraphs on fullwidth terminators and preserves headings', () => {
    const md = '# 第一章\n\n我喜欢读书。你呢？天气很好！';
    expect(extractListenSentences(md, LANGUAGES.zh)).toEqual([
      '第一章',
      '我喜欢读书。',
      '你呢？',
      '天气很好！',
    ]);
  });

  test('returns empty array for punctuation-only or empty markdown', () => {
    expect(extractListenSentences('   \n\n--- \n\n ... !!! ', LANGUAGES.en)).toEqual([]);
  });
});

describe('chunkSentenceForSpeech', () => {
  test('keeps short sentences intact', () => {
    expect(chunkSentenceForSpeech('Bonjour tout le monde.', LANGUAGES.fr)).toEqual([
      'Bonjour tout le monde.',
    ]);
  });

  test('chunks long spaced sentences at <= 220 chars on ASCII clause delimiters without splitting numbers', () => {
    const clause1 = `${'word '.repeat(28)}1,000,000 items,`;
    const clause2 = ` ${'more '.repeat(20)}at 10:30;`;
    const clause3 = ` ${'end '.repeat(15)}done.`;
    const sentence = clause1 + clause2 + clause3;
    expect(sentence.length).toBeGreaterThan(220);

    const chunks = chunkSentenceForSpeech(sentence, LANGUAGES.en);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(220);
    }
    expect(chunks[0]).toContain('1,000,000 items,');
    expect(chunks.join(' ')).toBe(sentence.replace(/\s+/g, ' ').trim());
  });

  test('chunks long CJK sentences at <= 70 chars on CJK delimiters and falls back to hard char boundaries', () => {
    const withPunct =
      '今天早晨天气非常晴朗，我们在公园里散步看到了很多漂亮的花朵；大家一边聊天一边拍照、吃着自己准备的点心，下午还一起去河边看日落和晚霞：度过了一个非常愉快而难忘的周末时光。';
    expect(withPunct.length).toBeGreaterThan(70);
    const chunks = chunkSentenceForSpeech(withPunct, LANGUAGES.zh);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(70);
    }
    expect(
      chunks[0].endsWith('；') ||
        chunks[0].endsWith('，') ||
        chunks[0].endsWith('：') ||
        chunks[0].endsWith('、'),
    ).toBe(true);
    expect(chunks.join('')).toBe(withPunct);

    const solid = '字'.repeat(155);
    const hardChunks = chunkSentenceForSpeech(solid, LANGUAGES.zh);
    expect(hardChunks.map((c) => c.length)).toEqual([70, 70, 15]);
    expect(hardChunks.join('')).toBe(solid);
  });

  test('chunks long spaced sentences on em-dash delimiters', () => {
    const first = `${'bonjour '.repeat(20)}tout le monde—`;
    const second = `${'merci '.repeat(20)}beaucoup.`;
    const sentence = first + second;
    expect(sentence.length).toBeGreaterThan(220);

    const chunks = chunkSentenceForSpeech(sentence, LANGUAGES.fr);
    expect(chunks.length).toBe(2);
    expect(chunks[0].endsWith('—')).toBe(true);
    expect(chunks[0].length).toBeLessThanOrEqual(220);
    expect(chunks[1].length).toBeLessThanOrEqual(220);
  });

  test('chunks long Arabic sentences on Arabic comma and semicolon delimiters', () => {
    const partA = 'ذهب الطالب إلى المكتبة الكبرى في وسط المدينة صباح اليوم '.repeat(3).trim() + '،';
    const partB = ' وقرأ كتاباً طويلاً عن التاريخ والعلوم والآداب القديمة؛';
    const partC = ' ثم عاد إلى بيته مسروراً بما تعلمه من معارف جديدة.';
    const sentence = partA + partB + partC;
    expect(sentence.length).toBeGreaterThan(220);

    const chunks = chunkSentenceForSpeech(sentence, LANGUAGES.ar);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(220);
    }
    expect(chunks[0].endsWith('،') || chunks[0].endsWith('؛')).toBe(true);
  });

  test('falls back to whitespace then hard boundary for spaced text without punctuation', () => {
    const spacedNoPunct = Array.from({ length: 50 }, (_, i) => `mot${i}`).join(' ');
    const spacedChunks = chunkSentenceForSpeech(spacedNoPunct, LANGUAGES.fr);
    expect(spacedChunks.length).toBeGreaterThanOrEqual(2);
    for (const chunk of spacedChunks) {
      expect(chunk.length).toBeLessThanOrEqual(220);
    }
    expect(spacedChunks.join(' ')).toBe(spacedNoPunct);

    const unbreakable = 'a'.repeat(460);
    const hardChunks = chunkSentenceForSpeech(unbreakable, LANGUAGES.fr);
    expect(hardChunks.map((c) => c.length)).toEqual([220, 220, 20]);
  });
});
