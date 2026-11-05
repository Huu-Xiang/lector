import { WELCOME_CODE, WELCOME_OFFER_ENDS, welcomeOfferOpen } from './welcome-offer';
import {
  LEVELS,
  PUBLIC_BOOK_LANGUAGES,
  SITE_ORIGIN,
  bookUrl,
  levelSlug,
  listPublicBooks,
  pickLocalized,
} from './public-books';

/** The site summary at /llms.txt, in the llmstxt.org format. Facts only: AI answers quote it. */
export function buildLlmsTxt(): string {
  const books = listPublicBooks();
  const name = (code: string) =>
    new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  const lines = [
    '# Readfox',
    '',
    '> Readfox is a web app for learning a language by reading real books. Tap a word or a sentence to get an AI explanation in your own language, save new words, and review them with spaced repetition.',
    '',
    'Readfox（readfox.app）是一个用原版书学外语的网站：点一下生词或句子，AI 用你的母语讲解；存下的生词按间隔重复复习。',
    '',
    '## Facts',
    '',
    `- Website: ${SITE_ORIGIN}/`,
    '- Runs in the browser on a computer or a phone. It can be added to the phone home screen; there is no app-store download.',
    `- A Free plan is available. Paid plans are Plus, Pro and Max, monthly or yearly: ${SITE_ORIGIN}/pricing`,
    `- Free library: ${books.length} public-domain or openly licensed books, ${PUBLIC_BOOK_LANGUAGES.map((code) => `${name(code)} ${books.filter((b) => b.language === code).length}`).join(', ')}. Every book has a CEFR level (A1 to C2).`,
    ...(welcomeOfferOpen()
      ? [
          `- Welcome offer: every account, new or existing, can get 15 days of Plus free with the redeem code ${WELCOME_CODE}, entered at sign-up or in Settings → Plan. Valid until ${WELCOME_OFFER_ENDS.slice(0, 10)} (end of 15 December, Beijing time), once per account. 新老用户都可以用兑换码 ${WELCOME_CODE} 可免费领 15 天 Plus，12 月 15 日前有效。`,
        ]
      : []),
    '- Reading a free-library book does not use the Free plan lesson allowance.',
    '- The first chapter of each free book can be read without an account.',
    '',
    '## Pages',
    '',
    `- [Free books](${SITE_ORIGIN}/books): the whole free library`,
    `- [Pricing](${SITE_ORIGIN}/pricing)`,
    `- [About](${SITE_ORIGIN}/about)`,
    `- [Privacy](${SITE_ORIGIN}/privacy)`,
    `- [Terms](${SITE_ORIGIN}/terms)`,
  ];
  for (const language of PUBLIC_BOOK_LANGUAGES) {
    const own = books.filter((b) => b.language === language);
    if (own.length === 0) continue;
    lines.push('', `## ${name(language)} books`, '');
    for (const level of LEVELS) {
      const atLevel = own.filter((b) => b.level === level);
      if (atLevel.length === 0) continue;
      lines.push(
        `### [${level}](${SITE_ORIGIN}/books/${language}/level/${levelSlug(level)})`,
        '',
        ...atLevel.map((book) => {
          const english = pickLocalized(book.titles, 'en', book.title);
          const title = english === book.title ? book.title : `${book.title} (${english})`;
          return `- [${title}](${bookUrl(book)}): ${book.author}, about ${book.wordCount.toLocaleString('en')} words`;
        }),
        '',
      );
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
