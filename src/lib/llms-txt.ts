import { TIER_ALLOWANCES } from './plan-prices';
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
  const fmt = (n: number) => n.toLocaleString('en');
  const paymentMethods =
    process.env.CARD_PAYMENTS_PENDING === '1'
      ? 'Alipay (card and PayPal coming soon)'
      : 'card, PayPal, or Alipay';
  const lines = [
    '# Readfox',
    '',
    '> Readfox is a web and iOS app for learning a language by reading real books. Tap a word or a sentence to get an AI explanation in your own language, save new words, and review them with spaced repetition.',
    '',
    'Readfox（readfox.app）是一个用原版书学外语的网页和 iOS 应用：点一下生词或句子，AI 用你的母语讲解；存下的生词按间隔重复复习。',
    '',
    '## Facts',
    '',
    `- Website: ${SITE_ORIGIN}`,
    '- Platforms: runs in the browser on desktop and mobile (installable as a PWA with offline reader shell) and as a companion iOS app.',
    '- Interface languages: English, Simplified Chinese, Traditional Chinese, Japanese, Korean, and Russian.',
    `- Localized entry URLs: English (${SITE_ORIGIN}), Simplified Chinese (${SITE_ORIGIN}/zh-cn), Traditional Chinese (${SITE_ORIGIN}/zh-tw), Japanese (${SITE_ORIGIN}/ja), Korean (${SITE_ORIGIN}/ko), Russian (${SITE_ORIGIN}/ru).`,
    `- Plans & monthly allowances (monthly or yearly billing; ${paymentMethods} at ${SITE_ORIGIN}/pricing):`,
    `  - Free ($0): ${fmt(TIER_ALLOWANCES.free.glosses)} AI word lookups and ${fmt(TIER_ALLOWANCES.free.detailed)} detailed AI explanations/month, up to ${TIER_ALLOWANCES.free.phraseWords}-word phrase selections, and unlimited reading of all free-library books.`,
    `  - Plus (from $3/month): ${fmt(TIER_ALLOWANCES.cloud.glosses)} AI word lookups and ${fmt(TIER_ALLOWANCES.cloud.detailed)} detailed AI explanations/month, up to ${TIER_ALLOWANCES.cloud.phraseWords}-word phrases, bigger library, managed TTS/transcription, and BYOK (your own OpenRouter or Anthropic API key).`,
    `  - Pro: ${fmt(TIER_ALLOWANCES.plus.glosses)} AI word lookups and ${fmt(TIER_ALLOWANCES.plus.detailed)} detailed AI explanations/month, unlimited library, managed TTS/transcription, and BYOK.`,
    `  - Max: ${fmt(TIER_ALLOWANCES.max.glosses)} AI word lookups and ${fmt(TIER_ALLOWANCES.max.detailed)} detailed AI explanations/month, unlimited phrase length, unlimited library, managed TTS/transcription, and BYOK.`,
    `- Free library: ${books.length} public-domain or openly licensed books, ${PUBLIC_BOOK_LANGUAGES.map((code) => `${name(code)} ${books.filter((b) => b.language === code).length}`).join(', ')}. Every book has a CEFR level (A1 to C2).`,
    '- Learning tools: tap-to-translate words and phrases with optional monolingual AI explanations, server-scheduled FSRS spaced-repetition word review with real example sentences, library concordance word search, zero-cost browser text-to-speech follow-along, EPUB/article import, and LingQ CSV known-words import.',
    ...(welcomeOfferOpen()
      ? [
          `- Welcome offer: a new account that verifies its email gets 15 days of Plus free, with no code needed. Valid until ${WELCOME_OFFER_ENDS.slice(0, 10)} (end of 15 December, Beijing time), once per account. Accounts made earlier can enter the redeem code ${WELCOME_CODE} in Settings → Plan. 新账号验证邮箱即可免费领 15 天 Plus，无需兑换码，12 月 15 日前有效；老账号可在设置 → 套餐输入兑换码 ${WELCOME_CODE}。`,
        ]
      : []),
    '- Reading a free-library book does not use the Free plan lesson allowance.',
    '- Interactive zero-signup reader demos run on the landing page, and the first chapter of every free book can be read without an account.',
    `- Free adaptive vocabulary size tests for English (${SITE_ORIGIN}/vocab-test), French (${SITE_ORIGIN}/vocab-test/fr), and Spanish (${SITE_ORIGIN}/vocab-test/es): about 2 minutes, no account needed. Each adapts to your answers, estimates vocabulary size and CEFR level (A1 to C2), and suggests free graded books you can read. A signed-in learner can save the level, and book picks follow it. 免费英语、法语、西班牙语词汇量测试，约 2 分钟，无需注册，给出词汇量、A1–C2 等级和适合阅读的免费书。`,
    '',
    '## Pages',
    '',
    `- [Free books](${SITE_ORIGIN}/books): the whole free library`,
    `- [English vocabulary test](${SITE_ORIGIN}/vocab-test): free, about 2 minutes, CEFR level and book picks`,
    `- [French vocabulary test](${SITE_ORIGIN}/vocab-test/fr): free adaptive French vocabulary size test with CEFR level and graded French books`,
    `- [Spanish vocabulary test](${SITE_ORIGIN}/vocab-test/es): free adaptive Spanish vocabulary size test with CEFR level and graded Spanish books`,
    `- [Compare alternatives](${SITE_ORIGIN}/alternatives): overview comparing Readfox with LingQ and Readlang`,
    `- [LingQ alternative](${SITE_ORIGIN}/alternatives/lingq): compare Readfox and LingQ (pricing, graded books, FSRS review, LingQ CSV import)`,
    `- [Readlang alternative](${SITE_ORIGIN}/alternatives/readlang): compare Readfox and Readlang (built-in graded books, FSRS review, browser TTS)`,
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
