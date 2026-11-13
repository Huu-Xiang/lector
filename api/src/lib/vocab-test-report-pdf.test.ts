import { expect, test } from 'bun:test';
import { extractText } from 'unpdf';
import type { VocabReport, VocabReportLocale } from '../../../languages/en/vocab-report';
import { renderVocabReportPdf } from './vocab-test-report-pdf';

const examples = [
  ['en', 'English vocabulary report', 'A Christmas Carol'],
  ['zh-CN', '英语词汇量报告', '圣诞颂歌'],
  ['zh-TW', '英語詞彙量報告', '小氣財神'],
  ['ja', '英語語彙力レポート', 'クリスマス・キャロル'],
  ['ko', '영어 어휘력 보고서', '크리스마스 캐럴'],
  ['ru', 'Отчёт о словарном запасе английского языка', 'Рождественская песнь'],
] as const;

function report(locale: VocabReportLocale, title: string): VocabReport {
  return {
    snapshot: {
      attemptId: 'c03c9e9e-108d-4f49-9d28-12dc33f30a4d',
      takenAt: '2026-11-12T09:00:00.000Z',
      locale,
      estimate: 4800,
      margin: 500,
      low: 4300,
      high: 5300,
      capped: false,
      level: 'B2',
      bookSlugs: title ? ['a-christmas-carol'] : [],
    },
    books: title ? [{ slug: 'a-christmas-carol', title }] : [],
    deliveryStatus: 'pending',
  };
}

function withoutWhitespace(text: string): string {
  return text.replace(/\s/g, '');
}

test.each(examples)('renders a selectable one-page report in %s', async (locale, title, book) => {
  const bytes = await renderVocabReportPdf(report(locale, book));
  const { text, totalPages } = await extractText(new Uint8Array(bytes), { mergePages: true });
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date('2026-11-12T09:00:00.000Z'),
  );
  expect(totalPages).toBe(1);
  expect(withoutWhitespace(text)).toContain(withoutWhitespace(title));
  expect(withoutWhitespace(text)).toContain(withoutWhitespace(book));
  expect(withoutWhitespace(text)).toContain(withoutWhitespace(date));
  const numbers = new Intl.NumberFormat(locale);
  expect(withoutWhitespace(text)).toContain(
    withoutWhitespace(`${numbers.format(4800)} ± ${numbers.format(500)}`),
  );
  expect(text).toContain('B2');
});

test('uses the Russian result labels for capped and zero-to-high estimates', async () => {
  const capped = report('ru', '');
  capped.snapshot.capped = true;
  const range = report('ru', '');
  range.snapshot.estimate = 0;
  range.snapshot.low = 0;
  range.snapshot.high = 1200;

  const cappedPdf = await renderVocabReportPdf(capped);
  const rangePdf = await renderVocabReportPdf(range);
  const a = await extractText(new Uint8Array(cappedPdf), { mergePages: true });
  const b = await extractText(new Uint8Array(rangePdf), { mergePages: true });

  expect(a.text).toContain('Более 30 000 слов');
  expect(a.text).toContain('Для этого результата нет рекомендаций по книгам.');
  expect(withoutWhitespace(b.text)).toContain('От0до1200слов');
  expect(b.text).toContain('Примерный уровень: B2');
  expect(b.text).toContain('Книги для вас');
});

test('preserves the displayed cap and zero-to-high estimates', async () => {
  const capped = report('en', '');
  capped.snapshot.capped = true;
  const range = report('en', '');
  range.snapshot.low = 0;
  range.snapshot.high = 1200;

  const cappedPdf = await renderVocabReportPdf(capped);
  const rangePdf = await renderVocabReportPdf(range);
  const a = await extractText(new Uint8Array(cappedPdf), { mergePages: true });
  const b = await extractText(new Uint8Array(rangePdf), { mergePages: true });

  expect(a.text).toContain('More than 30,000 words');
  expect(a.text).toContain('No book recommendations for this result.');
  expect(b.text).toContain('0 to 1,200 words');
});

test('wraps long book titles and keeps the recommendations on one page', async () => {
  const source = report('en', '');
  source.books = Array.from({ length: 20 }, (_, i) => ({
    slug: `book-${i + 1}`,
    title: `Book ${i + 1}: The Adventures of a Curious Reader `.repeat(8).trim(),
  }));
  const bytes = await renderVocabReportPdf(source);
  const { text, totalPages } = await extractText(new Uint8Array(bytes), { mergePages: true });
  expect(totalPages).toBe(1);
  expect(text).toContain('Book 1: The Adventures of a Curious Reader');
  expect(text).toContain('Book 2: The Adventures of a Curious Reader');
  expect(text).not.toContain('Book 20');
});

test('rejects an invalid test date instead of returning an attachment', async () => {
  const source = report('en', '');
  source.snapshot.takenAt = 'invalid';
  await expect(renderVocabReportPdf(source)).rejects.toThrow();
});
