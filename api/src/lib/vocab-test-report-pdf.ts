import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { IntlMessageFormat } from 'intl-messageformat';
import PDFDocument from 'pdfkit';
import type { VocabReport, VocabReportLocale } from '../../../languages/en/vocab-report';
import reportCopy from './vocab-test-report-copy.json';

type CatalogKey =
  | 'estimate'
  | 'estimateRange'
  | 'estimateCapped'
  | 'level'
  | 'explain'
  | 'booksTitle';

const PAGE_MARGIN = 54;
const INK = '#172c25';
const GREEN = '#215744';
const MUTED = '#485e55';
const PANEL = '#edf4ef';
const RULE = '#ccd9d1';

function resultMessages(locale: VocabReportLocale): Record<CatalogKey, string> {
  const url = new URL(`../../../messages/src/${locale}/vocabtest.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')).vocabTest;
}

function drawReport(pdf: PDFKit.PDFDocument, report: VocabReport, takenAt: Date): void {
  const { snapshot, books } = report;
  const { locale, level, estimate, margin, low, high, capped } = snapshot;
  const copy = reportCopy[locale];
  const messages = resultMessages(locale);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
    takenAt,
  );
  const scoreKey = capped ? 'estimateCapped' : low === 0 ? 'estimateRange' : 'estimate';
  const score = new IntlMessageFormat(messages[scoreKey], locale).format({
    count: estimate,
    margin,
    high,
  });
  const readingLevel = new IntlMessageFormat(messages.level, locale).format({ level });
  const font = locale === 'en' ? 'zh-CN' : locale;
  const fontPath = fileURLToPath(
    new URL(`../assets/vocab-report-fonts/${font}.otf`, import.meta.url),
  );
  pdf.font(fontPath);

  const x = PAGE_MARGIN;
  const width = pdf.page.width - x * 2;
  pdf.fillColor(GREEN).fontSize(12).text('Readfox', x, x);
  pdf
    .fillColor(INK)
    .fontSize(31)
    .text(copy.title, x, pdf.y + 12, { width });
  pdf
    .fillColor(MUTED)
    .fontSize(11)
    .text(`${copy.date} · ${date}`, x, pdf.y + 8, { width });

  const top = pdf.y + 26;
  const inset = 24;
  const innerWidth = width - inset * 2;
  pdf.fontSize(30);
  const scoreHeight = pdf.heightOfString(score, { width: innerWidth });
  pdf.fontSize(14);
  const levelHeight = pdf.heightOfString(readingLevel, { width: innerWidth });
  const panelHeight = inset * 2 + scoreHeight + 8 + levelHeight;
  pdf.roundedRect(x, top, width, panelHeight, 12).fill(PANEL);
  pdf
    .fillColor(INK)
    .fontSize(30)
    .text(score, x + inset, top + inset, { width: innerWidth });
  pdf
    .fillColor(GREEN)
    .fontSize(14)
    .text(readingLevel, x + inset, pdf.y + 8, { width: innerWidth });

  pdf
    .fillColor(MUTED)
    .fontSize(11)
    .text(messages.explain, x, top + panelHeight + 18, { width });
  pdf.text(copy.levelNote, x, pdf.y + 7, { width });
  const divider = pdf.y + 24;
  pdf
    .moveTo(x, divider)
    .lineTo(x + width, divider)
    .lineWidth(0.7)
    .strokeColor(RULE)
    .stroke();
  pdf
    .fillColor(INK)
    .fontSize(17)
    .text(messages.booksTitle, x, divider + 18, { width });
  pdf.fontSize(12);

  if (books.length === 0) {
    pdf.fillColor(MUTED).text(copy.emptyBooks, x, pdf.y + 12, { width });
    return;
  }

  for (const [index, { title }] of books.entries()) {
    const rowTop = pdf.y + 12;
    const titleWidth = width - 18;
    const height = pdf.heightOfString(title, { width: titleWidth });
    const remaining = pdf.page.height - PAGE_MARGIN - rowTop;
    if (remaining <= 0 || (index > 0 && height > remaining)) break;

    pdf.fillColor(GREEN).text('•', x, rowTop, { lineBreak: false });
    pdf.fillColor(INK).text(title, x + 18, rowTop, {
      width: titleWidth,
      height: remaining,
      ellipsis: true,
    });
  }
}

export async function renderVocabReportPdf(report: VocabReport): Promise<Buffer> {
  const takenAt = new Date(report.snapshot.takenAt);
  if (Number.isNaN(takenAt.getTime())) throw new Error('Invalid vocabulary test date');
  const copy = reportCopy[report.snapshot.locale];
  const pdf = new PDFDocument({
    size: 'A4',
    margin: PAGE_MARGIN,
    lang: report.snapshot.locale,
    info: {
      Title: `Readfox · ${copy.title}`,
      Author: 'Readfox',
      CreationDate: takenAt,
      ModDate: takenAt,
    },
  });

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    try {
      drawReport(pdf, report, takenAt);
      pdf.end();
    } catch (error) {
      pdf.destroy();
      reject(error);
    }
  });
}
