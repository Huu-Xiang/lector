import { SITE_ORIGIN } from './public-books';
import { publicUrl } from './public-locale';

export const WORKFLOW_TOOL_SLUGS = [
  'epub-reader-ai-dictionary',
  'youtube-language-reader',
  'anki-reading-workflow',
] as const;

export type WorkflowToolSlug = (typeof WORKFLOW_TOOL_SLUGS)[number];

export const ALL_PUBLIC_TOOL_PATHS = [
  '/tools',
  '/tools/text-difficulty',
  ...WORKFLOW_TOOL_SLUGS.map((slug) => `/tools/${slug}`),
] as const;

export function isWorkflowToolSlug(value: string): value is WorkflowToolSlug {
  return (WORKFLOW_TOOL_SLUGS as readonly string[]).includes(value);
}

export function toolPath(slug: WorkflowToolSlug | 'text-difficulty'): string {
  return `/tools/${slug}`;
}

export interface PreviewWordEntry {
  word: string;
  phonetic: string;
  pos: string;
  dictionaryMeaning: string;
  contextMeaning: string;
  contextExplanation: string;
  sentence: string;
}

export interface WorkflowToolContent {
  slug: WorkflowToolSlug;
  metaTitle: string;
  metaDescription: string;
  title: string;
  eyebrow: string;
  summary: string;
  previewHeading: string;
  previewHint: string;
  previewPassage: string;
  previewWords: PreviewWordEntry[];
  stepsHeading: string;
  steps: Array<{ title: string; body: string }>;
  faq: Array<{ q: string; a: string }>;
  primaryCtaLabel: string;
  primaryCtaHref: string;
}

type SupportedLocale = 'en' | 'zh-CN' | 'zh-TW' | 'ja' | 'ko' | 'ru';

function normalizeLocale(locale: string): SupportedLocale {
  if (
    locale === 'zh-CN' ||
    locale === 'zh-TW' ||
    locale === 'ja' ||
    locale === 'ko' ||
    locale === 'ru'
  ) {
    return locale;
  }
  return 'en';
}

const WORKFLOW_ENGLISH: Record<WorkflowToolSlug, WorkflowToolContent> = {
  'epub-reader-ai-dictionary': {
    slug: 'epub-reader-ai-dictionary',
    metaTitle: 'EPUB Reader with Contextual AI Popup Dictionary | Readfox',
    metaDescription:
      'Import your own EPUB books and tap any word or phrase to see what it means in that exact sentence—with FSRS spaced repetition and Anki export.',
    title: 'Read EPUB books with a contextual AI popup dictionary',
    eyebrow: 'EPUB Reader Workflow',
    summary:
      'Plain e-book dictionaries dump 10 isolated definitions and break your reading flow. Readfox lets you import your own EPUB files (or pick from {books} built-in graded books), tap any word for an instant offline gloss plus a 1-click AI “In this sentence” explanation, and save the contextual meaning straight into FSRS review.',
    previewHeading: 'Try tapping a highlighted word in this EPUB excerpt',
    previewHint: 'Compare what a plain dictionary shows vs. Readfox “In this sentence”.',
    previewPassage:
      'After three failed launches, she still couldn’t stomach the idea of starting over. The team moved fast to address the flaw before morning, determined to weather the storm together.',
    previewWords: [
      {
        word: 'stomach',
        phonetic: '/ˈstʌm.ək/',
        pos: 'v.',
        dictionaryMeaning: 'n. the organ in your body where food goes; belly',
        contextMeaning: 'tolerate or bear (something unpleasant)',
        contextExplanation:
          'Used here as a verb rather than the noun “belly”—she could not bear the thought of starting over from scratch.',
        sentence: 'After three failed launches, she still couldn’t stomach the idea of starting over.',
      },
      {
        word: 'address',
        phonetic: '/əˈdres/',
        pos: 'v.',
        dictionaryMeaning: 'n. street location; formal speech; website URL',
        contextMeaning: 'deal with and fix (a problem)',
        contextExplanation:
          'In the collocation “address the flaw”, it means actively fixing the defect rather than a mailing address or speech.',
        sentence: 'The team moved fast to address the flaw before morning, determined to weather the storm together.',
      },
      {
        word: 'weather',
        phonetic: '/ˈweð.ər/',
        pos: 'v.',
        dictionaryMeaning: 'n. rain, sun, wind, or temperature outside',
        contextMeaning: 'get through a difficult situation safely',
        contextExplanation:
          'Paired with “the storm”, the verb “weather” means enduring a tough period without giving up.',
        sentence: 'The team moved fast to address the flaw before morning, determined to weather the storm together.',
      },
    ],
    stepsHeading: 'How the EPUB reading workflow works',
    steps: [
      {
        title: '1. Import any EPUB or pick a graded book',
        body: 'Upload your DRM-free EPUB book in seconds or start immediately with {books} built-in A1–C2 public-domain books.',
      },
      {
        title: '2. Tap a word or drag-select a phrase',
        body: 'Get an instant on-device dictionary lookup first, then tap “In context” for an AI explanation tied to the exact sentence—or “Break down sentence” for dense clauses.',
      },
      {
        title: '3. Remember the exact meaning you read',
        body: 'Readfox stores the contextual meaning as your preferred definition and schedules reviews automatically with FSRS spaced repetition and optional Anki export.',
      },
    ],
    faq: [
      {
        q: 'What EPUB formats does Readfox support?',
        a: 'Readfox imports standard DRM-free EPUB e-books into your personal library, splits chapters cleanly for smooth reading, and tracks known and learning words across every chapter.',
      },
      {
        q: 'How is contextual AI lookup different from a regular Kindle or EPUB dictionary?',
        a: 'A standard dictionary lists every possible definition out of context. Readfox reads the surrounding sentence to tell you the exact sense, idiom, or nuance used on that page.',
      },
      {
        q: 'Can I use Readfox EPUB reading on my phone too?',
        a: 'Yes. Readfox runs in desktop and mobile browsers (installable as a PWA with offline shell) and has a companion iOS app so your reading progress and vocabulary stay in sync.',
      },
    ],
    primaryCtaLabel: 'Create free account & import an EPUB',
    primaryCtaHref: '/register',
  },
  'youtube-language-reader': {
    slug: 'youtube-language-reader',
    metaTitle: 'Read Transcripts, Subtitles & Web Articles with AI Context Lookup | Readfox',
    metaDescription:
      'Turn web articles, transcripts, and spoken-dialogue lessons into interactive reading material with contextual AI lookup, follow-along TTS, and FSRS review.',
    title: 'Learn languages from transcripts, web articles & spoken text',
    eyebrow: 'Transcript & Article Workflow',
    summary:
      'Spoken videos and interviews are packed with phrasal verbs and idioms that plain dictionaries miss. Paste any transcript, subtitle text, or web article URL into Readfox to read with instant contextual AI explanations, multi-word phrase breakdowns, browser text-to-speech follow-along, and FSRS review.',
    previewHeading: 'Try tapping a spoken idiom in this interview transcript',
    previewHint: 'See how Readfox breaks down real conversational expressions in context.',
    previewPassage:
      'When the host asked for the name of her first mentor, Maya drew a blank on live air. She laughed it off and promised to table the backstory until the Q&A.',
    previewWords: [
      {
        word: 'drew a blank',
        phonetic: '/druː ə blæŋk/',
        pos: 'idiom',
        dictionaryMeaning: 'draw (sketch/pull) + blank (empty space)',
        contextMeaning: 'completely failed to remember or find an answer',
        contextExplanation:
          'A fixed spoken idiom meaning your mind suddenly went empty—not literally sketching an empty box.',
        sentence: 'When the host asked for the name of her first mentor, Maya drew a blank on live air.',
      },
      {
        word: 'laughed it off',
        phonetic: '/læft ɪt ɒf/',
        pos: 'phr. v.',
        dictionaryMeaning: 'laugh (chuckle) + off (away)',
        contextMeaning: 'treated an awkward moment lightly with a laugh',
        contextExplanation:
          'Used when someone dismisses embarrassment or criticism casually instead of letting it derail them.',
        sentence: 'She laughed it off and promised to table the backstory until the Q&A.',
      },
      {
        word: 'table',
        phonetic: '/ˈteɪ.bəl/',
        pos: 'v.',
        dictionaryMeaning: 'n. furniture with four legs and a flat top',
        contextMeaning: 'postpone discussing a topic until later (US usage)',
        contextExplanation:
          'In American English, “table a topic” means setting it aside for later (note: in British English it can mean putting it forward for discussion!).',
        sentence: 'She laughed it off and promised to table the backstory until the Q&A.',
      },
    ],
    stepsHeading: 'How to study transcripts & articles in Readfox',
    steps: [
      {
        title: '1. Paste a transcript or web article URL',
        body: 'Import any pasted video transcript, podcast script, or web article directly into your Readfox library alongside your books.',
      },
      {
        title: '2. Highlight multi-word idioms & phrasal verbs',
        body: 'Drag across expressions like “drew a blank” or “laughed it off” to see both literal parts and natural spoken meaning, or ask the AI tutor about tone and register.',
      },
      {
        title: '3. Listen along and retain every phrase',
        body: 'Use zero-cost browser text-to-speech follow-along to shadow the transcript, and review saved phrases with original sentences in FSRS practice.',
      },
    ],
    faq: [
      {
        q: 'Can I import web articles and pasted transcripts for free?',
        a: 'Yes. Free accounts can import articles and pasted text lessons alongside unlimited reading of all {books} built-in graded books, with {freeLookups} AI lookups and {freeDetailed} detailed explanations per month.',
      },
      {
        q: 'Does Readfox support direct YouTube URL import?',
        a: 'Direct YouTube subtitle import is rolled out progressively depending on deployment settings; pasting any transcript or article URL works immediately across all accounts.',
      },
      {
        q: 'Why is Readfox better than watching with raw dual subtitles?',
        a: 'Dual subtitles let your eyes default to your native language. Reading the transcript interactively forces active comprehension while keeping 1-tap contextual lookup and FSRS review one click away.',
      },
    ],
    primaryCtaLabel: 'Start studying transcripts in Readfox',
    primaryCtaHref: '/register',
  },
  'anki-reading-workflow': {
    slug: 'anki-reading-workflow',
    metaTitle: 'Turn Book Reading into FSRS & Anki Sentence Cards | Readfox',
    metaDescription:
      'Stop making flashcards by hand. Look up words in context while reading books in Readfox, review natively with FSRS, or export sentence cards to Anki.',
    title: 'Turn real reading into FSRS & Anki sentence flashcards',
    eyebrow: 'FSRS & Anki Workflow',
    summary:
      'Sentence mining by hand (copying quotes, formatting cloze deletions, pasting dictionary definitions) kills reading momentum. In Readfox, every word or phrase you look up automatically captures its original book sentence and contextual meaning—ready for built-in FSRS review or clean export into Anki.',
    previewHeading: 'Tap a word to preview the contextual sentence card Readfox captures',
    previewHint: 'Each saved card keeps the exact contextual meaning instead of an isolated dictionary dump.',
    previewPassage:
      'Her quiet resolve held steady even when the negotiations stalled. By dusk, the committee struck a compromise nobody had expected.',
    previewWords: [
      {
        word: 'resolve',
        phonetic: '/rɪˈzɒlv/',
        pos: 'n.',
        dictionaryMeaning: 'v. to solve a problem or settle a dispute',
        contextMeaning: 'firm determination (noun)',
        contextExplanation:
          'Following the adjective “quiet”, “resolve” is a noun meaning inner determination—not the verb “to solve”.',
        sentence: 'Her quiet resolve held steady even when the negotiations stalled.',
      },
      {
        word: 'stalled',
        phonetic: '/stɔːld/',
        pos: 'v.',
        dictionaryMeaning: 'n. a market booth; an engine stopping suddenly',
        contextMeaning: 'stopped making progress; got stuck',
        contextExplanation:
          'Used figuratively for talks or projects that suddenly lose momentum and stop moving forward.',
        sentence: 'Her quiet resolve held steady even when the negotiations stalled.',
      },
      {
        word: 'struck a compromise',
        phonetic: '/strʌk ə ˈkɒm.prə.maɪz/',
        pos: 'collocation',
        dictionaryMeaning: 'strike (hit) + compromise (mutual concession)',
        contextMeaning: 'reached a balanced agreement after negotiation',
        contextExplanation:
          'The standard verb paired with “compromise” or “deal” in English is “strike”, meaning to successfully agree.',
        sentence: 'By dusk, the committee struck a compromise nobody had expected.',
      },
    ],
    stepsHeading: 'From page to long-term memory in 3 steps',
    steps: [
      {
        title: '1. Read without copy-pasting',
        body: 'Tap any word or drag-select a collocation while reading one of {books} free graded books or your own EPUBs. Readfox attaches the source sentence automatically.',
      },
      {
        title: '2. Save the contextual meaning as primary',
        body: 'When you run “In context”, Readfox prioritizes that sentence-accurate meaning so your review cards never quiz you on the wrong dictionary sense.',
      },
      {
        title: '3. Review in native FSRS or export to Anki',
        body: 'Practice directly inside Readfox using server-scheduled FSRS (flashcards, cloze, typing, and listening modes) or export your vocabulary deck to Anki anytime.',
      },
    ],
    faq: [
      {
        q: 'Does Readfox use FSRS or older SM-2 scheduling?',
        a: 'Readfox uses FSRS (Free Spaced Repetition Scheduler), the modern memory model adopted by Anki, tuned so you spend less time reviewing words you already know.',
      },
      {
        q: 'Can I still export my Readfox cards to Anki?',
        a: 'Yes. Readfox supports Anki export as well as full JSON data export—your vocabulary is never locked inside a proprietary wall.',
      },
      {
        q: 'What makes sentence cards better than isolated word lists?',
        a: 'Seeing the original sentence where you met the word anchors collocations, grammar, and exact nuance—especially for polysemous words like “resolve” or “address”.',
      },
    ],
    primaryCtaLabel: 'Try reading with built-in FSRS free',
    primaryCtaHref: '/books',
  },
};

interface ToolsUiStrings {
  breadcrumbHome: string;
  breadcrumbTools: string;
  hubMetaTitle: string;
  hubMetaDescription: string;
  hubTitle: string;
  hubIntro: string;
  hubCtaOpen: string;
  difficultyCardTitle: string;
  difficultyCardDesc: string;
  vocabCardTitle: string;
  vocabCardDesc: string;
  diffMetaTitle: string;
  diffMetaDescription: string;
  diffTitle: string;
  diffIntro: string;
  plainDictLabel: string;
  inContextLabel: string;
  savedCardHint: string;
  browseBooksCta: string;
  vocabTestCta: string;
  allToolsLink: string;
  alternativesLink: string;
  faqHeading: string;
  languageGuidesHeading: string;
}

const TOOLS_UI: Record<SupportedLocale, ToolsUiStrings> = {
  en: {
    breadcrumbHome: 'Readfox',
    breadcrumbTools: 'Free Tools',
    hubMetaTitle: 'Free Language Reading Tools: CEFR Text Checker, Vocab Tests & Workflows | Readfox',
    hubMetaDescription:
      'Free language learning tools from Readfox: check the CEFR difficulty of any English, French, or Spanish text, test your vocabulary size, and explore EPUB & Anki reading workflows.',
    hubTitle: 'Free language reading tools',
    hubIntro:
      'Check how hard a passage is before you read it, measure your vocabulary size in 2 minutes, or explore how contextual AI lookup turns EPUBs and transcripts into lasting vocabulary.',
    hubCtaOpen: 'Open tool',
    difficultyCardTitle: 'CEFR Text Difficulty Checker (EN / FR / ES)',
    difficultyCardDesc:
      'Paste any English, French, or Spanish passage to estimate its CEFR level (A1–C2), highlight uncommon words with inline glosses, and find matching graded books.',
    vocabCardTitle: 'Adaptive Vocabulary Size Tests (EN / FR / ES)',
    vocabCardDesc:
      'Estimate your reading vocabulary and CEFR level in about 2 minutes with zero sign-up, then jump straight into matched free books.',
    diffMetaTitle: 'Free CEFR Text Difficulty Checker (English, French, Spanish) | Readfox',
    diffMetaDescription:
      'Paste any English, French, or Spanish text to estimate its CEFR reading level (A1–C2), highlight hard words with dictionary glosses, and get matched free graded books.',
    diffTitle: 'CEFR text difficulty checker',
    diffIntro:
      'Paste an article, exam passage, or book excerpt in English, French, or Spanish. Readfox analyzes word frequency bands and sentence length to estimate its CEFR level (A1–C2), highlight harder words you can tap for instant glosses, and recommend free graded books at that level.',
    plainDictLabel: 'Plain dictionary',
    inContextLabel: 'AI · In this sentence',
    savedCardHint: 'Saved with this exact sentence and contextual meaning in FSRS & Anki export',
    browseBooksCta: 'Browse {books} free graded books',
    vocabTestCta: 'Take free 2-min vocab test',
    allToolsLink: 'All free tools',
    alternativesLink: 'Compare alternatives',
    faqHeading: 'Frequently asked questions',
    languageGuidesHeading: 'Language-specific LingQ guides',
  },
  'zh-CN': {
    breadcrumbHome: 'Readfox',
    breadcrumbTools: '免费工具',
    hubMetaTitle: '免费外语阅读工具：CEFR 文本难度检测、词汇量测试与阅读工作流 | Readfox',
    hubMetaDescription:
      'Readfox 免费外语工具合集：一键检测英文/法文/西文段落的 CEFR 等级与生词密度、2 分钟免费测词汇量，以及 EPUB 语境查词与 Anki 复习工作流。',
    hubTitle: '免费外语阅读工具',
    hubIntro:
      '读原著前先测文章难度、2 分钟摸清自己的词汇量，或体验如何把 EPUB 电子书、字幕文稿和生词卡片串成高效阅读闭环。',
    hubCtaOpen: '立即使用',
    difficultyCardTitle: 'CEFR 文本难度与生词检测器（英 / 法 / 西）',
    difficultyCardDesc:
      '粘贴任意英文、法文或西文段落，立刻估算 CEFR 等级（A1–C2）与对应雅思/托福/四六级水平，高亮难词并支持点词看释义。',
    vocabCardTitle: '免费自适应词汇量测试（英 / 法 / 西）',
    vocabCardDesc: '无需注册，约 2 分钟测出阅读词汇量与 CEFR 等级，并直接推荐匹配你当前水平的免费原版书。',
    diffMetaTitle: '免费 CEFR 文本难度检测器（英文/法文/西文难词分析）| Readfox',
    diffMetaDescription:
      '粘贴任意英文、法文或西文段落，免费测出 CEFR 阅读难度（A1–C2）、所需词汇量与雅思/四六级对照，点击高亮生词即看释义。',
    diffTitle: 'CEFR 文本难度检测器',
    diffIntro:
      '粘贴一段外刊、真题或原著节选（支持英语、法语、西班牙语），系统会结合词频分布与句长即时估算 CEFR 等级（A1–C2）、高亮中高阶生词（点击可直接看词频与释义），并为你匹配同难度的免费原著。',
    plainDictLabel: '普通词典',
    inContextLabel: 'AI · 在这句话里',
    savedCardHint: '连同当前原句与语境释义一起存入 FSRS 复习 / Anki 导出',
    browseBooksCta: '浏览 {books} 本免费分级原著',
    vocabTestCta: '免费测 2 分钟词汇量',
    allToolsLink: '全部免费工具',
    alternativesLink: '对比同类工具',
    faqHeading: '常见问题',
    languageGuidesHeading: '按语言对比 LingQ',
  },
  'zh-TW': {
    breadcrumbHome: 'Readfox',
    breadcrumbTools: '免費工具',
    hubMetaTitle: '免費外語閱讀工具：CEFR 文本難度檢測、字彙量測驗與閱讀流程 | Readfox',
    hubMetaDescription:
      'Readfox 免費外語閱讀工具：檢測英/法/西文段落的 CEFR 等級與生字密度、2 分鐘免費測字彙量，以及 EPUB 與 Anki 閱讀流程。',
    hubTitle: '免費外語閱讀工具',
    hubIntro: '閱讀原著前先測文章難度、2 分鐘了解字彙量，並體驗結合語境的 AI 查詞與 FSRS 複習流程。',
    hubCtaOpen: '立即使用',
    difficultyCardTitle: 'CEFR 文本難度檢測器（英 / 法 / 西）',
    difficultyCardDesc: '貼上英文、法文或西文段落，立即估算 CEFR 等級（A1–C2）、標註進階生字並推薦對應原著。',
    vocabCardTitle: '免費自適應字彙量測驗（英 / 法 / 西）',
    vocabCardDesc: '免註冊約 2 分鐘估測閱讀字彙量與 CEFR 等級，立即推薦合適的免費原著。',
    diffMetaTitle: '免費 CEFR 文本難度檢測器（英/法/西文生字分析）| Readfox',
    diffMetaDescription: '貼上任意英、法、西文段落，免費檢測 CEFR 等級（A1–C2）與生字釋義，推薦同難度免費分級原著。',
    diffTitle: 'CEFR 文本難度檢測器',
    diffIntro: '貼上一篇文章或書摘（支援英語、法語、西班牙語），即時估算 CEFR 等級（A1–C2）、高亮較難單字供點擊查閱，並推薦對應分級原著。',
    plainDictLabel: '一般詞典',
    inContextLabel: 'AI · 在這句話裡',
    savedCardHint: '連同原句與語境釋義存入 FSRS 複習 / Anki 匯出',
    browseBooksCta: '瀏覽 {books} 本免費分級原著',
    vocabTestCta: '免費做 2 分鐘字彙測驗',
    allToolsLink: '全部免費工具',
    alternativesLink: '比較同類工具',
    faqHeading: '常見問題',
    languageGuidesHeading: '依語言比較 LingQ',
  },
  ja: {
    breadcrumbHome: 'Readfox',
    breadcrumbTools: '無料ツール',
    hubMetaTitle: '無料語学リーディングツール：CEFR難易度チェッカー・語彙テスト | Readfox',
    hubMetaDescription:
      '英語・フランス語・スペイン語のCEFR難易度チェック、無料語彙力テスト、EPUBやAnki連携の多読ワークフローを提供。',
    hubTitle: '無料リーディング学習ツール',
    hubIntro: '文章のCEFR難易度を即座に判定したり、2分で語彙力を測ったり、文脈AI辞書の多読ワークフローを体験できます。',
    hubCtaOpen: 'ツールを開く',
    difficultyCardTitle: 'CEFRテキスト難易度チェッカー（英・仏・西）',
    difficultyCardDesc: '文章を貼り付けるだけでCEFRレベル（A1–C2）を推定し、難単語をハイライト表示します。',
    vocabCardTitle: '無料語彙力テスト（英・仏・西）',
    vocabCardDesc: '登録不要・約2分で語彙数とCEFRレベルを診断し、レベルに合った無料原書を提案します。',
    diffMetaTitle: '無料CEFRテキスト難易度チェッカー（英語・仏語・西語）| Readfox',
    diffMetaDescription: '英語・フランス語・スペイン語の文章を貼り付けてCEFRレベル（A1–C2）と難単語を無料チェック。',
    diffTitle: 'CEFRテキスト難易度チェッカー',
    diffIntro: '英語・フランス語・スペイン語の記事や本の抜粋を貼り付けると、語彙頻度と文の長さからCEFRレベル（A1–C2）を推定し、難しい単語をタップして意味を確認できます。',
    plainDictLabel: '一般辞書',
    inContextLabel: 'AI · この文での意味',
    savedCardHint: '元の例文と文脈上の意味をそのままFSRS復習・Anki出力へ保存',
    browseBooksCta: '{books}冊の無料原書を見る',
    vocabTestCta: '無料2分の語彙力テスト',
    allToolsLink: 'すべての無料ツール',
    alternativesLink: '他サービスとの比較',
    faqHeading: 'よくある質問',
    languageGuidesHeading: '言語別の LingQ 比較ガイド',
  },
  ko: {
    breadcrumbHome: 'Readfox',
    breadcrumbTools: '무료 도구',
    hubMetaTitle: '무료 원서 읽기 도구: CEFR 난이도 검사기·어휘력 테스트 | Readfox',
    hubMetaDescription:
      '영어·프랑스어·스페인어 지문의 CEFR 난이도 분석, 무료 어휘력 테스트, EPUB·Anki 문맥 학습 워크플로우.',
    hubTitle: '무료 외국어 읽기 도구',
    hubIntro: '원서를 읽기 전에 텍스트 난이도를 확인하고, 2분 어휘력 테스트와 문맥 AI 사전 워크플로우를 체험해 보세요.',
    hubCtaOpen: '도구 열기',
    difficultyCardTitle: 'CEFR 텍스트 난이도 검사기 (영/불/서)',
    difficultyCardDesc: '지문을 붙여 넣으면 CEFR 등급(A1–C2)을 추정하고 어려운 단어를 하이라이트합니다.',
    vocabCardTitle: '무료 적응형 어휘력 테스트 (영/불/서)',
    vocabCardDesc: '가입 없이 2분 만에 읽기 어휘량과 CEFR 등급을 측정하고 맞춤 원서를 추천받으세요.',
    diffMetaTitle: '무료 CEFR 텍스트 난이도 검사기 (영어·프랑스어·스페인어) | Readfox',
    diffMetaDescription: '영어·프랑스어·스페인어 지문을 붙여 넣어 CEFR 등급(A1–C2)과 어려운 단어를 무료로 분석하세요.',
    diffTitle: 'CEFR 텍스트 난이도 검사기',
    diffIntro: '기사나 원서 일부를 붙여 넣으면 단어 빈도와 문장 길이를 분석해 CEFR 등급(A1–C2)을 추정하고, 하이라이트된 단어를 눌러 뜻을 바로 확인할 수 있습니다.',
    plainDictLabel: '일반 사전',
    inContextLabel: 'AI · 이 문장에서의 뜻',
    savedCardHint: '원문 예문과 문맥 뜻을 그대로 FSRS 복습 및 Anki 내보내기에 저장',
    browseBooksCta: '무료 원서 {books}권 둘러보기',
    vocabTestCta: '무료 2분 어휘력 테스트',
    allToolsLink: '모든 무료 도구',
    alternativesLink: '대안 비교 보기',
    faqHeading: '자주 묻는 질문',
    languageGuidesHeading: '언어별 LingQ 비교 가이드',
  },
  ru: {
    breadcrumbHome: 'Readfox',
    breadcrumbTools: 'Бесплатные инструменты',
    hubMetaTitle: 'Бесплатные инструменты для чтения: проверка CEFR, тест словаря | Readfox',
    hubMetaDescription:
      'Определите уровень CEFR любого текста на английском, французском или испанском, пройдите тест словарного запаса и изучите рабочие процессы EPUB и Anki.',
    hubTitle: 'Бесплатные инструменты для чтения',
    hubIntro: 'Проверьте сложность текста до начала чтения, оцените словарный запас за 2 минуты и попробуйте контекстный ИИ-словарь.',
    hubCtaOpen: 'Открыть инструмент',
    difficultyCardTitle: 'Проверка сложности текста CEFR (EN / FR / ES)',
    difficultyCardDesc: 'Вставьте отрывок текста, чтобы оценить уровень CEFR (A1–C2), увидеть сложные слова и подобрать книги.',
    vocabCardTitle: 'Адаптивные тесты словарного запаса (EN / FR / ES)',
    vocabCardDesc: 'Без регистрации за 2 минуты узнайте словарный запас и уровень CEFR с подборкой бесплатных книг.',
    diffMetaTitle: 'Бесплатная проверка уровня CEFR текста (EN / FR / ES) | Readfox',
    diffMetaDescription: 'Вставьте английский, французский или испанский текст, чтобы оценить уровень CEFR (A1–C2) и сложную лексику.',
    diffTitle: 'Проверка сложности текста CEFR',
    diffIntro: 'Вставьте статью или отрывок из книги на английском, французском или испанском: инструмент оценит уровень CEFR (A1–C2), выделит редкие слова с переводом по клику и подберёт бесплатные книги.',
    plainDictLabel: 'Обычный словарь',
    inContextLabel: 'ИИ · В этом предложении',
    savedCardHint: 'Сохраняется вместе с исходным предложением для FSRS и экспорта в Anki',
    browseBooksCta: 'Смотреть {books} бесплатных книг',
    vocabTestCta: 'Бесплатный тест словаря (2 мин)',
    allToolsLink: 'Все бесплатные инструменты',
    alternativesLink: 'Сравнение с аналогами',
    faqHeading: 'Частые вопросы',
    languageGuidesHeading: 'Сравнение с LingQ по языкам',
  },
};

const WORKFLOW_OVERRIDES: Partial<
  Record<
    SupportedLocale,
    Record<WorkflowToolSlug, Partial<Pick<WorkflowToolContent, 'metaTitle' | 'metaDescription' | 'title' | 'eyebrow' | 'summary' | 'previewHeading' | 'previewHint'>>>
  >
> = {
  'zh-CN': {
    'epub-reader-ai-dictionary': {
      metaTitle: '带 AI 上下文弹窗词典的 EPUB 外文阅读器 | Readfox',
      metaDescription:
        '导入自己的 EPUB 外文电子书，点词秒看“在这句话里”的 AI 语境解释，自动连同原句进入 FSRS 间隔复习与 Anki 导出。',
      title: '用带 AI 语境词典的阅读器读 EPUB 外文书',
      eyebrow: 'EPUB 精读工作流',
      summary:
        '普通电子书词典一次堆出 10 条孤立释义，查完早就打断阅读心流。在 Readfox 导入自己的 EPUB 电子书（或直接读内置 {books} 本分级原著），点一下词先出离线释义，再一键“结合语境”看 AI 针对当前句子的精准讲解，并自动存入 FSRS 复习。',
      previewHeading: '试着点一下下面 EPUB 节选里的高亮词',
      previewHint: '直观对比「普通词典」与 Readfox「在这句话里」的差距。',
    },
    'youtube-language-reader': {
      metaTitle: '外文视频文稿、字幕与外刊 AI 语境精读工具 | Readfox',
      metaDescription:
        '把外文视频文稿、字幕或外刊文章变成交互式精读材料：拖选拆解习语短语、AI 结合上下文精讲、浏览器跟读朗读与 FSRS 复习。',
      title: '把视频文稿、字幕与外刊变成 AI 语境精读课',
      eyebrow: '文稿与外刊精读',
      summary:
        '口语访谈、视频和外刊里塞满了词典查不到的习语与动词短语。把文稿、字幕或文章链接放进 Readfox，拖选短语就能同时看字面义和地道用法，搭配免费浏览器跟读朗读与 FSRS 复习，真正把听过读过的表达留下来。',
      previewHeading: '试着点一下下面访谈文稿里的地道短语',
      previewHint: '看看 Readfox 如何结合语境拆解口语习语与多义词。',
    },
    'anki-reading-workflow': {
      metaTitle: '读原著自动生成 FSRS 与 Anki 原句闪卡 | Readfox',
      metaDescription:
        '告别手动复制例句制卡！在 Readfox 读外文书时点词查语境，自动抓取原句与上下文释义，内置 FSRS 间隔复习并支持导出到 Anki。',
      title: '告别手动制卡：边读原著边生成 FSRS & Anki 原句闪卡',
      eyebrow: 'FSRS & Anki 复习闭环',
      summary:
        '传统“挖句制卡”要反复复制句子、贴释义、改完形填空，非常消耗阅读热情。在 Readfox 里读原著时，每次点词或划选短语都会自动带上原句与“在这句话里”的准确释义，直接进入内置 FSRS 复习或随时导出到 Anki。',
      previewHeading: '点一下高亮词，预览自动生成的原句语境卡片',
      previewHint: '记住的是“这句话里的真实意思”，而不是孤立的词典条目。',
    },
  },
};

export function getToolsUi(locale: string): ToolsUiStrings {
  return TOOLS_UI[normalizeLocale(locale)];
}

export function getWorkflowToolContent(
  slug: WorkflowToolSlug,
  locale: string,
  vars: { books: number; freeLookups: string; freeDetailed: number },
): WorkflowToolContent {
  const base = WORKFLOW_ENGLISH[slug];
  const loc = normalizeLocale(locale);
  const override = WORKFLOW_OVERRIDES[loc]?.[slug];
  const merged = { ...base, ...(override ?? {}) };
  const fill = (s: string) =>
    s
      .replaceAll('{books}', String(vars.books))
      .replaceAll('{freeLookups}', vars.freeLookups)
      .replaceAll('{freeDetailed}', String(vars.freeDetailed));

  return {
    ...merged,
    metaTitle: fill(merged.metaTitle),
    metaDescription: fill(merged.metaDescription),
    title: fill(merged.title),
    summary: fill(merged.summary),
    steps: merged.steps.map((step) => ({
      title: fill(step.title),
      body: fill(step.body),
    })),
    faq: merged.faq.map(({ q, a }) => ({
      q: fill(q),
      a: fill(a),
    })),
  };
}

export function toolPageJsonLd({
  url,
  title,
  description,
  homeLabel,
  toolsLabel,
  localePrefix = '',
  inLanguage,
  faq,
  isWebApp = false,
}: {
  url: string;
  title: string;
  description: string;
  homeLabel: string;
  toolsLabel: string;
  localePrefix?: string;
  inLanguage?: string;
  faq: Array<{ q: string; a: string }>;
  isWebApp?: boolean;
}): Array<Record<string, unknown>> {
  const list: Array<Record<string, unknown>> = [
    {
      '@context': 'https://schema.org',
      '@type': isWebApp ? 'WebApplication' : 'SoftwareApplication',
      name: title,
      url,
      ...(inLanguage ? { inLanguage } : {}),
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web, iOS',
      description,
      image: `${SITE_ORIGIN}/og.png`,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      publisher: { '@id': `${SITE_ORIGIN}/#organization` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: homeLabel, item: publicUrl('/', localePrefix) },
        {
          '@type': 'ListItem',
          position: 2,
          name: toolsLabel,
          item: publicUrl('/tools', localePrefix),
        },
        { '@type': 'ListItem', position: 3, name: title, item: url },
      ],
    },
  ];
  if (faq.length > 0) {
    list.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    });
  }
  return list;
}

export function toolsHubJsonLd({
  url,
  title,
  description,
  homeLabel,
  toolsLabel,
  localePrefix = '',
  inLanguage,
  items,
}: {
  url: string;
  title: string;
  description: string;
  homeLabel: string;
  toolsLabel: string;
  localePrefix?: string;
  inLanguage?: string;
  items: Array<{ name: string; url: string; description: string }>;
}): Array<Record<string, unknown>> {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: title,
      url,
      description,
      ...(inLanguage ? { inLanguage } : {}),
      isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: title,
      itemListElement: items.map((item, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        name: item.name,
        url: item.url,
        description: item.description,
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: homeLabel, item: publicUrl('/', localePrefix) },
        { '@type': 'ListItem', position: 2, name: toolsLabel, item: url },
      ],
    },
  ];
}
