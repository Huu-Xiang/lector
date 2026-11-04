import '../../test-guard';
import { describe, expect, test } from 'bun:test';
import { buildLibraryIndex, getLibraryIndex } from './sentence-index';
import { findSentence } from './sentence-sources';

const run = process.env.REVIEW_INDEX_BENCH === '1' ? describe : describe.skip;

run('shipped library index', () => {
  test('cold build, warm lookup and memory for English and French', async () => {
    const rssBefore = process.memoryUsage().rss;
    const t0 = performance.now();
    for (const language of ['en', 'fr']) {
      const t = performance.now();
      const index = await buildLibraryIndex(language);
      console.log(
        `${language}: ${index!.chapters.length} chapters, ${Math.round(performance.now() - t)} ms`,
      );
    }
    const coldMs = performance.now() - t0;
    const rssGrowthMb = (process.memoryUsage().rss - rssBefore) / 1e6;
    const forms = { en: ['harbor', 'harbors'], fr: ['port', 'ports'] };
    const timings: number[] = [];
    for (const [language, words] of Object.entries(forms)) {
      for (const word of ['house', 'walk', 'remember', words[0]]) {
        const start = performance.now();
        const found = findSentence(
          {
            word,
            type: 'word',
            language,
            level: 'B1',
            savedSentence: '',
            lastSentenceKey: 'saved',
          },
          {
            forms: () => (word === words[0] ? words : []),
            examples: () => [],
            bank: () => [],
            library: getLibraryIndex,
            random: Math.random,
          },
        );
        const ms = performance.now() - start;
        timings.push(ms);
        console.log(
          `${language} "${word}": ${ms.toFixed(1)} ms, ${found?.source.bookTitle ?? 'none'}`,
        );
      }
    }
    const warm = findSentence(
      {
        word: 'house',
        type: 'word',
        language: 'en',
        level: 'B1',
        savedSentence: '',
        lastSentenceKey: 'saved',
      },
      {
        forms: () => [],
        examples: () => [],
        bank: () => [],
        library: getLibraryIndex,
        random: Math.random,
      },
    );
    const w0 = performance.now();
    findSentence(
      {
        word: 'house',
        type: 'word',
        language: 'en',
        level: 'B1',
        savedSentence: '',
        lastSentenceKey: warm?.key ?? null,
      },
      {
        forms: () => [],
        examples: () => [],
        bank: () => [],
        library: getLibraryIndex,
        random: Math.random,
      },
    );
    console.log(
      `cold build both: ${Math.round(coldMs)} ms; RSS growth: ${rssGrowthMb.toFixed(0)} MB; repeat lookup: ${(performance.now() - w0).toFixed(1)} ms; max lookup: ${Math.max(...timings).toFixed(1)} ms`,
    );
    expect(coldMs).toBeLessThan(2000);
    expect(rssGrowthMb).toBeLessThan(200);
    expect(Math.max(...timings)).toBeLessThan(50);
  }, 30000);
});
