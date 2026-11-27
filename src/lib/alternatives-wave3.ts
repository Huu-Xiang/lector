import type { ComparisonRowKey, Wave3AlternativeCompetitor } from './alternatives';

export interface Wave3AlternativeContent {
  metaTitle: string;
  metaDescription: string;
  title: string;
  summary: string;
  competitorName: string;
  rows: Record<ComparisonRowKey, string>;
  readfoxWins: [string, string, string];
  competitorWins: [string, string, string];
  faq: Array<{ q: string; a: string }>;
  highlightCta?: {
    href: string;
    label: string;
  };
}

interface TemplateVars {
  books: number;
  plusPrice: string;
  freeLookups: string;
  freeDetailed: number;
}

type SupportedLocale = 'en' | 'zh-CN' | 'zh-TW' | 'ja' | 'ko' | 'ru';

function normalizeLocale(locale: string): SupportedLocale {
  if (locale === 'zh-CN' || locale === 'zh-TW' || locale === 'ja' || locale === 'ko' || locale === 'ru') {
    return locale;
  }
  return 'en';
}

function interpolate(text: string, vars: TemplateVars): string {
  return text
    .replaceAll('{books}', String(vars.books))
    .replaceAll('{plusPrice}', vars.plusPrice)
    .replaceAll('{freeLookups}', vars.freeLookups)
    .replaceAll('{freeDetailed}', String(vars.freeDetailed));
}

const ENGLISH_CONTENT: Record<Wave3AlternativeCompetitor, Wave3AlternativeContent> = {
  lute: {
    metaTitle: 'Readfox vs Lute: Hosted AI Reading Alternative to Self-Hosted Lute',
    metaDescription:
      'Compare Readfox and Lute (Learning Using Texts): zero-setup cloud sync, {books} graded books, contextual AI lookup, FSRS review, and Plus from {plusPrice}/mo.',
    title: 'Readfox as a Lute alternative',
    summary:
      'Lute (Learning Using Texts) is an excellent free self-hosted reading tool if you enjoy running Python/Docker locally and wiring custom web dictionaries. Readfox gives you the same calm, book-first workflow in the browser and iOS with zero server setup, {books} built-in CEFR-graded books, contextual AI explanations, and FSRS spaced repetition starting free (Plus from {plusPrice}/mo).',
    competitorName: 'Lute',
    rows: {
      price: 'Free and open source (you host it yourself on your computer or VPS)',
      freeLibrary: 'No built-in graded library; you import your own texts and EPUBs',
      lookup: 'Configurable external web dictionaries per language; no built-in contextual AI',
      review: 'Word familiarity statuses (1–5) with Anki export; no native FSRS scheduler',
      audio: 'Supports uploading local audio files to pair with imported texts',
      import: 'EPUB, plain text, web URLs, and LingQ/CSV term import',
      offline: 'Runs locally on localhost when self-hosted on your own machine',
      openSource: 'MIT open-source Python web application',
    },
    readfoxWins: [
      'Zero server setup: open readfox.app on desktop or phone with automatic sync and {books} built-in A1–C2 books.',
      'Built-in contextual AI lookup explains what a word or idiom means in that exact sentence (native or monolingual mode).',
      'Native FSRS spaced-repetition review with real book example sentences, plus Anki export and free browser TTS.',
    ],
    competitorWins: [
      'Completely free forever with zero subscription limits when self-hosted on your own machine.',
      'Deep customizability for power users who want arbitrary external dictionary iframes and custom parsers.',
      'All personal reading data stays 100% on your local machine by default.',
    ],
    faq: [
      {
        q: 'Why choose Readfox instead of self-hosting Lute?',
        a: 'Choose Readfox if you want to start reading on desktop and mobile immediately without managing Python/Docker, want {books} graded books ready out of the box, and want built-in contextual AI explanations and FSRS review.',
      },
      {
        q: 'Is Readfox also open source like Lute?',
        a: 'Yes. Readfox is an AGPL-3.0 open-source fork with full JSON vocabulary export and no third-party ad trackers, while also offering a hosted service starting free (Plus from {plusPrice}/mo).',
      },
      {
        q: 'Can I still use my own AI API key in Readfox?',
        a: 'Yes. Paid plans support BYOK (your own OpenRouter or Anthropic API key) alongside Readfox’s built-in monthly AI allowance.',
      },
      {
        q: 'Does Readfox support Anki export like Lute?',
        a: 'Yes. You can review directly inside Readfox with FSRS spaced repetition or export saved words and sentences to Anki.',
      },
    ],
  },
  duolingo: {
    metaTitle: 'Readfox vs Duolingo: Move from Streaks to Reading Real Books',
    metaDescription:
      'Ready to graduate from Duolingo? Readfox helps you learn languages by reading {books} CEFR-graded books with contextual AI lookup and FSRS review.',
    title: 'Readfox as a Duolingo alternative for real reading',
    summary:
      'Duolingo is great for building a daily habit at the absolute beginner stage, but isolated translated sentences rarely bridge the gap to reading real novels or news. Readfox is built for comprehensible input: tap any word in {books} CEFR-graded books (or your own EPUBs) for an instant contextual AI explanation, then retain what you read with FSRS spaced repetition.',
    competitorName: 'Duolingo',
    rows: {
      price: 'Free with ads/hearts; Super typically ~$6.99–$12.99/mo, Max higher',
      freeLibrary: 'Short guided stories in major courses; no full graded public-domain book library',
      lookup: 'Tap-to-peek fixed exercise hints; no open-ended reading dictionary',
      review: 'Gamified drill lessons and hearts/XP streaks rather than book-context FSRS',
      audio: 'Short scripted lesson clips and character voices',
      import: 'Closed curriculum; cannot import your own EPUBs, articles, or books',
      offline: 'Offline lessons available on paid mobile tiers',
      openSource: 'Proprietary commercial app',
    },
    readfoxWins: [
      'Real comprehensible input: read {books} graded books (A1–C2) or your own EPUBs and articles instead of repetitive drills.',
      'Tap any word or multi-word phrase to see what it means in that exact sentence—ideal for polysemous words and idioms.',
      'Science-backed FSRS review saves words together with the original book sentence, starting free ({freeLookups} AI lookups/mo).',
    ],
    competitorWins: [
      'Zero-friction gamified onboarding for absolute beginners starting from letter one.',
      'Offers 40+ courses with structured bite-sized speaking, listening, and typing exercises.',
      'Strong streak notifications and leaderboards if external gamification keeps you consistent.',
    ],
    faq: [
      {
        q: 'Can beginners who only used Duolingo start reading in Readfox?',
        a: 'Yes. Take the free 2-minute vocabulary test first, and Readfox recommends A1–A2 graded books matched to your level so you can read comfortably with one-tap contextual lookup.',
      },
      {
        q: 'Should I quit Duolingo completely to use Readfox?',
        a: 'Many learners pair both early on: use Duolingo for 5-minute drills and Readfox for 15 minutes of real book reading, then transition fully to reading and FSRS review once you reach A2–B1.',
      },
      {
        q: 'Does Readfox have a free plan?',
        a: 'Yes. Free accounts get unlimited reading across all {books} free-library books, free on-device dictionary lookup, {freeLookups} AI lookups, and {freeDetailed} detailed AI explanations every month.',
      },
      {
        q: 'How does Readfox help me remember vocabulary without gamified XP?',
        a: 'Words you look up can be saved with their exact sentence context and reviewed via FSRS spaced repetition, which schedules reviews right before you forget.',
      },
    ],
    highlightCta: {
      href: '/vocab-test',
      label: 'Find your reading level first (free 2-min test)',
    },
  },
  'lingq-for-japanese': {
    metaTitle: 'Readfox vs LingQ for Japanese: Contextual AI Reader Alternative',
    metaDescription:
      'Compare Readfox and LingQ for reading Japanese: contextual AI grammar & nuance lookup, calmer reading UI, FSRS review, BYOK, and Plus from {plusPrice}/mo.',
    title: 'Readfox as a LingQ alternative for Japanese',
    summary:
      'Many Japanese learners leave LingQ because of subscription pricing, noisy community hints, and clunky kanji/particle lookups. Readfox gives you a distraction-free Japanese reading workspace where you import your own EPUBs or articles, tap words or phrases for contextual AI explanations that actually read the whole sentence, and review saved words with FSRS—starting free with Plus from {plusPrice}/mo.',
    competitorName: 'LingQ (Japanese)',
    rows: {
      price: 'Limited free LingQ slots; Premium around $12.99/mo billed monthly',
      freeLibrary: 'Large community Japanese mini-stories and podcast transcripts',
      lookup: 'User-submitted hints (often inconsistent for Japanese) and dictionary links',
      review: 'LingQ 1–4 status flashcards and SRS drills',
      audio: 'Synced audio on community mini-stories and imported podcasts',
      import: 'Browser extension, EPUB, YouTube/Netflix import',
      offline: 'Native iOS/Android apps with offline lesson download',
      openSource: 'Proprietary platform',
    },
    readfoxWins: [
      'Contextual AI lookup explains kanji compounds, particles, and conjugations inside the exact Japanese sentence—no guessing from noisy user hints.',
      'Far lower cost: free tier with {freeLookups} AI lookups/mo, Plus from {plusPrice}/mo, and BYOK support for your own AI key.',
      'Calm book-first typography, FSRS spaced repetition with original sentences, and direct LingQ CSV known-words import.',
    ],
    competitorWins: [
      'LingQ has a large built-in catalog of Japanese mini-stories and podcasts, whereas Readfox’s free public-domain catalog currently focuses on EN/FR/ES/ZH/KO (Japanese uses your own imported EPUBs/articles).',
      'Includes a browser extension for one-click importing from Japanese YouTube and streaming sites.',
      'Bundled human-recorded audio across many beginner Japanese mini-stories.',
    ],
    faq: [
      {
        q: 'Does Readfox include built-in free Japanese books?',
        a: 'Readfox’s {books} built-in graded public-domain books currently cover English, French, Spanish, Chinese, and Korean. For Japanese, you can import your own EPUBs, web articles, or pasted Japanese text and use full contextual AI lookup and FSRS review.',
      },
      {
        q: 'Why is contextual AI helpful for Japanese reading compared to plain hints?',
        a: 'Japanese words shift meaning heavily with particles, politeness level, and surrounding clauses. Tapping “In context” explains what the word or expression means in that specific sentence, plus you can break down the full sentence or ask the AI tutor.',
      },
      {
        q: 'Can I import my existing Japanese known words from LingQ?',
        a: 'Yes. Export your Japanese vocabulary list as CSV from LingQ and upload it in Readfox Settings → Known words import.',
      },
      {
        q: 'How much cheaper is Readfox than LingQ?',
        a: 'Readfox starts free with {freeLookups} AI lookups/mo and paid Plus starts from {plusPrice}/mo (with BYOK support), compared to LingQ’s ~$12.99/mo monthly tier.',
      },
    ],
  },
  'lingq-for-korean': {
    metaTitle: 'Readfox vs LingQ for Korean: Free Books & Automatic Particle Splitting',
    metaDescription:
      'Compare Readfox and LingQ for Korean reading: built-in free Korean classic books, automatic particle/ending splitting, contextual AI lookup, and Plus from {plusPrice}/mo.',
    title: 'Readfox as a LingQ alternative for Korean',
    summary:
      'Korean agglutinative particles and verb endings (like 집을 or 먹어요) often break simple word-by-word lookup tools. Readfox automatically splits Korean particles and endings back to the dictionary stem, explains words in sentence context with AI, ships built-in free Korean public-domain works, and imports your LingQ CSV word list—starting free with Plus from {plusPrice}/mo.',
    competitorName: 'LingQ (Korean)',
    rows: {
      price: 'Limited free LingQ slots; Premium around $12.99/mo billed monthly',
      freeLibrary: 'Community Korean mini-stories and user-shared lessons',
      lookup: 'Community hints that often split or duplicate inflected Korean forms',
      review: 'LingQ 1–4 status cards and built-in review drills',
      audio: 'Human and TTS audio on community Korean lessons',
      import: 'Browser extension, EPUB, and YouTube/Netflix import',
      offline: 'Native iOS/Android offline downloads',
      openSource: 'Proprietary commercial app',
    },
    readfoxWins: [
      'Automatic Korean particle and verb-ending lemma matching plus contextual AI explanations that explain nuance and register in the full sentence.',
      'Built-in free Korean public-domain literature ready to read immediately, plus easy EPUB and web article import.',
      'Lower pricing (free tier + Plus from {plusPrice}/mo), FSRS spaced repetition, and 1-step LingQ CSV vocabulary import.',
    ],
    competitorWins: [
      'Larger library of modern beginner Korean mini-stories and podcast transcripts with human audio.',
      'One-click browser extension for importing Korean YouTube and Netflix subtitles.',
      'Mature community-shared Korean lesson ecosystem.',
    ],
    faq: [
      {
        q: 'How does Readfox handle Korean particles and verb conjugations?',
        a: 'When you tap an inflected form like 집을 or 먹어요, Readfox resolves the dictionary lemma automatically and lets you tap “In context” so AI explains the exact grammatical role and meaning in that sentence.',
      },
      {
        q: 'Are there free Korean books built into Readfox?',
        a: 'Yes. Readfox includes curated public-domain Korean literary works that you can preview and read for free, alongside importing your own Korean EPUBs or articles.',
      },
      {
        q: 'Can I migrate my Korean vocabulary list from LingQ?',
        a: 'Yes. Export your Korean CSV from LingQ and upload it in Settings → Known words import to carry over your known and learning words.',
      },
      {
        q: 'Does Readfox support Korean UI as well?',
        a: 'Yes. Readfox has a full Korean interface (readfox.app/ko) alongside English, Chinese, Japanese, and Russian.',
      },
    ],
    highlightCta: {
      href: '/books/ko',
      label: 'Browse free Korean books',
    },
  },
  'lingq-for-french': {
    metaTitle: 'Readfox vs LingQ for French: 89 Graded Books & Free French Vocab Test',
    metaDescription:
      'Compare Readfox and LingQ for French: 89 built-in CEFR A1–C2 French books, free adaptive French vocab test, FSRS review, LingQ CSV import, and Plus from {plusPrice}/mo.',
    title: 'Readfox as a LingQ alternative for French',
    summary:
      'If you learn French through reading, Readfox ships 89 built-in CEFR-graded French books (A1–C2) with comprehension vocabulary estimates, a free 2-minute adaptive French vocabulary test, contextual AI explanations for tricky French expressions, FSRS review, and direct LingQ CSV import—starting free with Plus from {plusPrice}/mo.',
    competitorName: 'LingQ (French)',
    rows: {
      price: 'Limited free LingQ slots; Premium around $12.99/mo billed monthly',
      freeLibrary: 'Large community French lesson catalog and mini-stories behind login',
      lookup: 'Community hints and dictionary links; AI explanations on higher plans',
      review: 'LingQ 1–4 status flashcards',
      audio: 'Human-narrated mini-stories and imported French podcasts',
      import: 'Browser extension, EPUB, YouTube/Netflix import',
      offline: 'Native mobile apps with offline audio lessons',
      openSource: 'Proprietary platform',
    },
    readfoxWins: [
      '89 curated CEFR A1–C2 French books with first-chapter no-signup previews and word-family coverage estimates (n95/n98).',
      'Free adaptive French vocabulary test (/vocab-test/fr) that estimates your DELF/DALF & CEFR band and picks readable French books immediately.',
      'Contextual AI lookup for French idioms and verb tenses, FSRS spaced repetition, LingQ CSV import, and Plus from {plusPrice}/mo.',
    ],
    competitorWins: [
      'Huge library of contemporary French podcasts and human-narrated beginner mini-stories.',
      'Browser extension for importing French YouTube and streaming subtitles in one click.',
      'Long-established community French course catalog.',
    ],
    faq: [
      {
        q: 'How many free French books does Readfox include?',
        a: 'Readfox includes 89 free public-domain French books graded from A1 to C2, and you can read the first chapter of any book without creating an account.',
      },
      {
        q: 'Can I test my French reading level before picking a book?',
        a: 'Yes. Try the free 2-minute adaptive French vocabulary test at /vocab-test/fr to estimate your vocabulary size, CEFR level (A1–C2), and matched French books.',
      },
      {
        q: 'Can I import my French LingQs into Readfox?',
        a: 'Yes. Export your French vocabulary CSV from LingQ and upload it in Readfox Settings → Known words import.',
      },
      {
        q: 'Does Readfox have French audio follow-along?',
        a: 'Yes. Every French text lesson includes zero-cost browser text-to-speech follow-along, and paid plans also support managed TTS audio.',
      },
    ],
    highlightCta: {
      href: '/vocab-test/fr',
      label: 'Take the free French vocab test',
    },
  },
};

type LocaleOverride = Partial<
  Pick<Wave3AlternativeContent, 'metaTitle' | 'metaDescription' | 'title' | 'summary' | 'highlightCta'>
>;

const LOCALE_OVERRIDES: Partial<
  Record<SupportedLocale, Record<Wave3AlternativeCompetitor, LocaleOverride>>
> = {
  'zh-CN': {
    lute: {
      metaTitle: 'Readfox 对比 Lute：免折腾自部署的 AI 语境阅读替代方案',
      metaDescription:
        '对比 Readfox 与开源自托管工具 Lute：零部署云同步、{books} 本分级原著、AI 结合语境查词、FSRS 间隔复习，Plus 低至 {plusPrice}/月。',
      title: 'Readfox 作为 Lute 替代方案',
      summary:
        'Lute（Learning Using Texts）是非常优秀的免费自托管阅读学习工具，但需要自己折腾 Python/Docker 并配置外部词典。Readfox 同样提供开源透明、专注读书的体验，但打开网页就能用，自带 {books} 本 CEFR 分级原著、AI 结合句子语境精讲和 FSRS 复习，免费起步（Plus 低至 {plusPrice}/月）。',
    },
    duolingo: {
      metaTitle: 'Readfox 对比多邻国 Duolingo：从打卡刷题进阶到读懂外文原著',
      metaDescription:
        '想从多邻国进阶到真正读懂英文/法文/西文原著？对比 Readfox 与 Duolingo：{books} 本分级原著、点词查上下文与 FSRS 复习。',
      title: 'Readfox 作为多邻国（Duolingo）的进阶阅读替代方案',
      summary:
        '多邻国适合零基础培养每天打卡的习惯，但孤立的短句练习很难让你直接读懂原版书和外刊。Readfox 专注“可理解输入”：在 {books} 本分级原著或自己导入的 EPUB 里点词即可看 AI 结合上下文的精准解释，并连同原句进入 FSRS 科学复习。',
      highlightCta: { href: '/vocab-test', label: '先花 2 分钟免费测词汇量与阅读等级' },
    },
    'lingq-for-japanese': {
      metaTitle: 'Readfox 对比 LingQ（日语学习）：AI 语境查词与更低成本替代方案',
      metaDescription:
        '对比 Readfox 与 LingQ 学日语：AI 结合整句讲清汉字/助词/活用、纯净阅读界面、FSRS 复习、支持 BYOK，Plus 低至 {plusPrice}/月。',
      title: '学日语用 Readfox 替代 LingQ 怎么样？',
      summary:
        '不少日语学习者想换掉 LingQ，主要是因为订阅贵、社区词条质量参差不齐、界面偏杂。Readfox 提供更安静的阅读体验：导入自己的日语 EPUB 或文章后，点词或拖选短语即可用 AI 结合整句讲解意思和语气，支持 FSRS 复习与 LingQ CSV 导入，免费起步（Plus 低至 {plusPrice}/月）。',
    },
    'lingq-for-korean': {
      metaTitle: 'Readfox 对比 LingQ（韩语学习）：助词词尾自动拆解 + 免费原著',
      metaDescription:
        '对比 Readfox 与 LingQ 学韩语：自动拆解韩语助词与词尾、内置免费韩语公版书、AI 语境查词与 LingQ CSV 一键导入，Plus 低至 {plusPrice}/月。',
      title: '学韩语用 Readfox 替代 LingQ 怎么样？',
      summary:
        '韩语的黏着助词和词尾变化（如 집을、먹어요）常常让普通查词工具识别错位。Readfox 自动将韩语助词与词尾还原到词典原形，点一下就能用 AI 结合整句话讲清楚意思，内置免费韩语公版名作并支持导入 LingQ CSV 生词表，Plus 低至 {plusPrice}/月。',
      highlightCta: { href: '/books/ko', label: '浏览免费韩语原著' },
    },
    'lingq-for-french': {
      metaTitle: 'Readfox 对比 LingQ（法语学习）：89 本免费分级原著 + 法语词汇量测试',
      metaDescription:
        '对比 Readfox 与 LingQ 学法语：89 本 CEFR A1–C2 法语免费原著、免费自适应法语词汇测试、FSRS 复习与 LingQ CSV 导入，Plus 低至 {plusPrice}/月。',
      title: '学法语用 Readfox 替代 LingQ 怎么样？',
      summary:
        '如果你靠读原著学法语，Readfox 内置 89 本 A1–C2 分级法语原著（附读懂 95%/98% 所需词汇量）、免费 2 分钟自适应法语词汇测试、AI 结合上下文讲解法语习语与变位，以及 FSRS 复习与 LingQ CSV 导入，免费起步（Plus 低至 {plusPrice}/月）。',
      highlightCta: { href: '/vocab-test/fr', label: '免费测你的法语词汇量（DELF/DALF）' },
    },
  },
  'zh-TW': {
    lute: {
      metaTitle: 'Readfox 比較 Lute：免自架伺服器的 AI 語境閱讀替代方案',
      metaDescription:
        '比較 Readfox 與開源工具 Lute：免部署雲端同步、{books} 本分級原著、AI 語境查詞與 FSRS 複習，Plus 低至 {plusPrice}/月。',
      title: 'Readfox 作為 Lute 替代方案',
      summary:
        'Lute 是優秀的開源自架閱讀工具，但需要自行維護 Python/Docker 環境。Readfox 提供同樣專注閱讀的開源體驗，打開網頁即可開始，內建 {books} 本分級原著、AI 語境查詞與 FSRS 間隔複習，免費起步（Plus 低至 {plusPrice}/月）。',
    },
    duolingo: {
      metaTitle: 'Readfox 比較 Duolingo：從打卡練習進階到讀懂外文原著',
      metaDescription:
        '想從 Duolingo 進階到真正閱讀外文書？比較 Readfox 與 Duolingo：{books} 本分級原著、點詞查語境與 FSRS 複習。',
      title: 'Readfox 作為 Duolingo 的進階閱讀替代方案',
      summary:
        'Duolingo 適合入門養成每日習慣，但片段題目難以直接銜接原版書閱讀。Readfox 專注可理解輸入：在 {books} 本分級原著或自匯入 EPUB 中點擊單字即可看 AI 語境精講，並搭配 FSRS 科學複習。',
      highlightCta: { href: '/vocab-test', label: '先做免費 2 分鐘字彙量測驗' },
    },
    'lingq-for-japanese': {
      metaTitle: 'Readfox 比較 LingQ（日語）：AI 語境查詞與更親民方案',
      metaDescription:
        '比較 Readfox 與 LingQ 學日語：AI 結合整句解說漢字與助詞、純淨閱讀介面、FSRS 複習與 BYOK，Plus 低至 {plusPrice}/月。',
      title: '學日語用 Readfox 替代 LingQ',
      summary:
        'Readfox 提供更清爽的日語閱讀環境：匯入自己的日語 EPUB 或文章後，點詞即可由 AI 結合整句說明語意與語氣，支援 FSRS 複習、BYOK 與 LingQ CSV 匯入，Plus 低至 {plusPrice}/月。',
    },
    'lingq-for-korean': {
      metaTitle: 'Readfox 比較 LingQ（韓語）：助詞詞尾自動拆解與免費原著',
      metaDescription:
        '比較 Readfox 與 LingQ 學韓語：自動拆解韓語助詞詞尾、內建免費韓語公版書與 AI 語境查詞，Plus 低至 {plusPrice}/月。',
      title: '學韓語用 Readfox 替代 LingQ',
      summary:
        'Readfox 自動還原韓語助詞與詞尾變化，結合整句由 AI 說明語境意思，內建免費韓語公版文學並支援 LingQ CSV 匯入，Plus 低至 {plusPrice}/月。',
      highlightCta: { href: '/books/ko', label: '瀏覽免費韓語原著' },
    },
    'lingq-for-french': {
      metaTitle: 'Readfox 比較 LingQ（法語）：89 本分級原著與法語字彙測驗',
      metaDescription:
        '比較 Readfox 與 LingQ 學法語：89 本 A1–C2 法語原著、免費法語字彙量測驗、FSRS 複習與 LingQ CSV 匯入，Plus 低至 {plusPrice}/月。',
      title: '學法語用 Readfox 替代 LingQ',
      summary:
        'Readfox 內建 89 本 CEFR A1–C2 法語分級原著、免費 2 分鐘法語字彙測驗、AI 語境查詞與 FSRS 複習，並可直接匯入 LingQ CSV，Plus 低至 {plusPrice}/月。',
      highlightCta: { href: '/vocab-test/fr', label: '免費測試你的法語字彙量' },
    },
  },
  ja: {
    lute: {
      metaTitle: 'Readfox vs Lute：サーバー構築不要のAI文脈リーダー代替',
      metaDescription:
        'Readfoxとセルフホスト型Luteを比較。設定不要・{books}冊のレベル別原書・AI文脈解説・FSRS復習、Plusは月額{plusPrice}から。',
      title: 'Luteの代替としてのReadfox',
      summary:
        'Luteは優れたセルフホスト型多読ツールですが、PythonやDockerの構築が必要です。Readfoxはブラウザですぐ使え、{books}冊のCEFRレベル別原書・AI文脈解説・FSRS復習を標準搭載し、無料から始められます（Plus月額{plusPrice}〜）。',
    },
    duolingo: {
      metaTitle: 'Readfox vs Duolingo：クイズ学習から洋書多読へステップアップ',
      metaDescription:
        'Duolingoの次のステップに。{books}冊のCEFRレベル別原書とAI文脈辞書、FSRS復習で自然な語学力を身につけるReadfoxを比較。',
      title: 'Duolingoの次の一歩としてのReadfox',
      summary:
        'Duolingoは入門期の習慣化に最適ですが、本物の洋書や記事を読む力は多読で伸びます。Readfoxでは{books}冊の原書や自分のEPUBを読みながら、タップ1回で文脈に合ったAI解説とFSRS復習が使えます。',
      highlightCta: { href: '/vocab-test', label: '無料2分の語彙力テストを受ける' },
    },
    'lingq-for-japanese': {
      metaTitle: 'Readfox vs LingQ（日本語学習）：AI文脈解説と低価格な代替案',
      metaDescription:
        '日本語学習向けにReadfoxとLingQを比較。文脈を踏まえたAI解説、落ち着いた読書UI、FSRS復習、BYOK対応、Plusは月額{plusPrice}から。',
      title: '日本語学習でのLingQ代替としてのReadfox',
      summary:
        'LingQの料金やユーザー投稿ヒントのばらつきに悩む方へ。Readfoxなら自分のEPUBや記事を取り込み、文脈全体を読んだAI解説とFSRS復習、LingQ CSVインポートが月額{plusPrice}から利用できます。',
    },
    'lingq-for-korean': {
      metaTitle: 'Readfox vs LingQ（韓国語学習）：助詞・活用の自動分解＆無料原書',
      metaDescription:
        '韓国語学習向けにReadfoxとLingQを比較。助詞・活用形の自動辞書引き、無料韓国語原書、AI文脈解説、Plus月額{plusPrice}から。',
      title: '韓国語学習でのLingQ代替としてのReadfox',
      summary:
        'Readfoxは韓国語の助詞・活用形を自動で原形に分解し、文脈に合わせたAI解説を提供します。無料の韓国語原書ライブラリとLingQ CSVインポートにも対応し、無料から始められます。',
      highlightCta: { href: '/books/ko', label: '無料の韓国語原書を見る' },
    },
    'lingq-for-french': {
      metaTitle: 'Readfox vs LingQ（フランス語）：89冊の原書＆無料語彙テスト',
      metaDescription:
        'フランス語学習向けにReadfoxとLingQを比較。89冊のA1–C2原書、無料フランス語語彙テスト、FSRS復習、Plus月額{plusPrice}から。',
      title: 'フランス語学習でのLingQ代替としてのReadfox',
      summary:
        'Readfoxは89冊のCEFR A1–C2フランス語原書、無料の2分間フランス語語彙テスト、AI文脈解説、FSRS復習、LingQ CSVインポートを備え、月額{plusPrice}から利用できます。',
      highlightCta: { href: '/vocab-test/fr', label: '無料フランス語語彙テストを受ける' },
    },
  },
  ko: {
    lute: {
      metaTitle: 'Readfox vs Lute: 서버 설치 없는 AI 문맥 원서 읽기 대안',
      metaDescription:
        'Readfox와 셀프호스팅 Lute 비교: 설치 없는 클라우드 동기화, {books}권 등급별 원서, AI 문맥 설명, FSRS 복습, Plus 월 {plusPrice}부터.',
      title: 'Lute 대안으로서의 Readfox',
      summary:
        'Lute는 훌륭한 오픈소스 셀프호스팅 도구이지만 직접 서버를 운영해야 합니다. Readfox는 브라우저에서 바로 시작할 수 있으며 {books}권의 CEFR 원서, AI 문맥 설명, FSRS 복습을 무료부터 제공합니다(Plus 월 {plusPrice}~).',
    },
    duolingo: {
      metaTitle: 'Readfox vs Duolingo: 퀴즈 앱에서 실제 원서 읽기로 넘어가기',
      metaDescription:
        '듀오링고 다음 단계로 Readfox를 비교해 보세요. {books}권 등급별 원서, 문맥 AI 사전, FSRS 복습으로 자연스러운 독해력을 키웁니다.',
      title: 'Duolingo 다음 단계 대안으로서의 Readfox',
      summary:
        'Duolingo는 입문 습관 형성에 좋지만 실제 책과 기사를 읽는 단계로 넘어가기엔 한계가 있습니다. Readfox는 {books}권의 등급별 원서와 내 EPUB에서 단어를 눌러 문맥 뜻을 바로 보고 FSRS로 복습합니다.',
      highlightCta: { href: '/vocab-test', label: '무료 2분 어휘력 테스트 받기' },
    },
    'lingq-for-japanese': {
      metaTitle: 'Readfox vs LingQ (일본어): AI 문맥 해설과 합리적인 대안',
      metaDescription:
        '일본어 학습자를 위한 Readfox vs LingQ 비교: 문맥 AI 해설, 깔끔한 독서 UI, FSRS 복습, BYOK 지원, Plus 월 {plusPrice}부터.',
      title: '일본어 학습을 위한 LingQ 대안 Readfox',
      summary:
        'LingQ의 높은 구독료와 들쭉날쭉한 커뮤니티 힌트가 부담스럽다면, Readfox에서 내 일본어 EPUB·기사를 불러와 문장 전체를 이해하는 AI 해설과 FSRS 복습을 무료부터 이용해 보세요.',
    },
    'lingq-for-korean': {
      metaTitle: 'Readfox vs LingQ (한국어): 조사·어미 자동 분리 및 무료 원서',
      metaDescription:
        '한국어 학습을 위한 Readfox vs LingQ 비교: 조사·활용형 자동 원형 검색, 무료 한국어 고전 원서, AI 문맥 해설, Plus 월 {plusPrice}부터.',
      title: '한국어 학습을 위한 LingQ 대안 Readfox',
      summary:
        'Readfox는 집을·먹어요 같은 한국어 조사와 어미 변화를 자동으로 원형 매칭하고 AI가 문맥 속 의미를 설명합니다. 무료 한국어 원서와 LingQ CSV 가져오기도 지원합니다.',
      highlightCta: { href: '/books/ko', label: '무료 한국어 원서 둘러보기' },
    },
    'lingq-for-french': {
      metaTitle: 'Readfox vs LingQ (프랑스어): 89권 등급별 원서 & 무료 어휘 테스트',
      metaDescription:
        '프랑스어 학습자를 위한 Readfox vs LingQ 비교: 89권 A1–C2 원서, 무료 프랑스어 어휘 테스트, FSRS 복습, Plus 월 {plusPrice}부터.',
      title: '프랑스어 학습을 위한 LingQ 대안 Readfox',
      summary:
        'Readfox는 89권의 CEFR A1–C2 프랑스어 원서, 무료 2분 프랑스어 어휘 테스트, 문맥 AI 해설, FSRS 복습과 LingQ CSV 가져오기를 월 {plusPrice}부터 제공합니다.',
      highlightCta: { href: '/vocab-test/fr', label: '무료 프랑스어 어휘 테스트 받기' },
    },
  },
  ru: {
    lute: {
      metaTitle: 'Readfox vs Lute: облачная альтернатива с ИИ-контекстом без настройки сервера',
      metaDescription:
        'Сравнение Readfox и Lute: {books} книг по уровням CEFR, контекстный ИИ-перевод, FSRS-повторение и тариф Plus от {plusPrice}/мес без self-hosting.',
      title: 'Readfox как альтернатива Lute',
      summary:
        'Lute — отличный бесплатный инструмент для чтения при самостоятельном хостинге. Readfox даёт тот же спокойный фокус на книгах сразу в браузере: {books} книг уровней A1–C2, контекстные ИИ-объяснения и FSRS-повторение бесплатно (Plus от {plusPrice}/мес).',
    },
    duolingo: {
      metaTitle: 'Readfox vs Duolingo: переход от упражнений к чтению настоящих книг',
      metaDescription:
        'Готовы перейти от Duolingo к реальному чтению? Readfox предлагает {books} книг CEFR, контекстный ИИ-словарь и FSRS-повторение.',
      title: 'Readfox как альтернатива Duolingo для реального чтения',
      summary:
        'Duolingo помогает сформировать привычку на старте, но для беглого чтения нужны целые тексты. В Readfox вы читаете {books} книг A1–C2 или свои EPUB с мгновенным контекстным ИИ-разбором и повторением слов по FSRS.',
      highlightCta: { href: '/vocab-test', label: 'Пройти бесплатный тест словарного запаса' },
    },
    'lingq-for-japanese': {
      metaTitle: 'Readfox vs LingQ для японского: контекстный ИИ-разбор и доступная цена',
      metaDescription:
        'Сравнение Readfox и LingQ для японского языка: контекстные ИИ-объяснения, FSRS, BYOK и тариф Plus от {plusPrice}/мес.',
      title: 'Readfox как альтернатива LingQ для японского',
      summary:
        'Readfox позволяет импортировать свои японские EPUB и статьи, получать точные контекстные ИИ-объяснения с учётом всего предложения, повторять слова по FSRS и переносить словарь из LingQ CSV — от {plusPrice}/мес.',
    },
    'lingq-for-korean': {
      metaTitle: 'Readfox vs LingQ для корейского: разбор частиц и бесплатные книги',
      metaDescription:
        'Сравнение Readfox и LingQ для корейского: автоматический разбор частиц и окончаний, бесплатные книги, ИИ-контекст и Plus от {plusPrice}/мес.',
      title: 'Readfox как альтернатива LingQ для корейского',
      summary:
        'Readfox автоматически отделяет корейские частицы и окончания до словарной основы, объясняет слова в контексте предложения с помощью ИИ, включает бесплатные корейские книги и импорт LingQ CSV.',
      highlightCta: { href: '/books/ko', label: 'Бесплатные книги на корейском' },
    },
    'lingq-for-french': {
      metaTitle: 'Readfox vs LingQ для французского: 89 книг CEFR и бесплатный тест',
      metaDescription:
        'Сравнение Readfox и LingQ для французского: 89 книг A1–C2, бесплатный адаптивный тест словарного запаса, FSRS и Plus от {plusPrice}/мес.',
      title: 'Readfox как альтернатива LingQ для французского',
      summary:
        'Readfox включает 89 бесплатных французских книг уровней A1–C2, бесплатный 2-минутный тест французского словарного запаса (/vocab-test/fr), контекстный ИИ-словарь, FSRS и импорт LingQ CSV — Plus от {plusPrice}/мес.',
      highlightCta: { href: '/vocab-test/fr', label: 'Пройти бесплатный тест по французскому' },
    },
  },
};

export function getWave3AlternativeContent(
  competitor: Wave3AlternativeCompetitor,
  locale: string,
  vars: TemplateVars,
): Wave3AlternativeContent {
  const base = ENGLISH_CONTENT[competitor];
  const loc = normalizeLocale(locale);
  const override = LOCALE_OVERRIDES[loc]?.[competitor];
  const merged: Wave3AlternativeContent = {
    ...base,
    ...(override ?? {}),
  };

  return {
    ...merged,
    metaTitle: interpolate(merged.metaTitle, vars),
    metaDescription: interpolate(merged.metaDescription, vars),
    title: interpolate(merged.title, vars),
    summary: interpolate(merged.summary, vars),
    rows: Object.fromEntries(
      Object.entries(merged.rows).map(([k, v]) => [k, interpolate(v, vars)]),
    ) as Record<ComparisonRowKey, string>,
    readfoxWins: [
      interpolate(merged.readfoxWins[0], vars),
      interpolate(merged.readfoxWins[1], vars),
      interpolate(merged.readfoxWins[2], vars),
    ],
    competitorWins: [
      interpolate(merged.competitorWins[0], vars),
      interpolate(merged.competitorWins[1], vars),
      interpolate(merged.competitorWins[2], vars),
    ],
    faq: merged.faq.map(({ q, a }) => ({
      q: interpolate(q, vars),
      a: interpolate(a, vars),
    })),
  };
}
