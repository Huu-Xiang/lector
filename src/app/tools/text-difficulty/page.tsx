import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import JsonLd from '@/components/JsonLd';
import { LegalShell, H2 } from '@/components/LegalLinks/shell';
import PublicLink from '@/components/PublicLink';
import TextDifficultyTool, { type DifficultyBookPick } from '@/components/TextDifficultyTool';
import { listPublicBooks, pickLocalized } from '@/lib/public-books';
import { activePublicLocalePrefix, publicAlternatesForRequest } from '@/lib/public-locale.server';
import { buildPublicTwitter, withPublicOg } from '@/lib/site-seo';
import { TEXT_DIFFICULTY_SAMPLES, type DifficultyLanguage } from '@/lib/text-difficulty';
import { loadSampleLexiconSubset } from '@/lib/text-difficulty-data';
import { getToolsUi, toolPageJsonLd } from '@/lib/tools';

export async function generateMetadata(): Promise<Metadata> {
  const [locale, { alternates, canonicalUrl }] = await Promise.all([
    getLocale(),
    publicAlternatesForRequest('/tools/text-difficulty'),
  ]);
  const ui = getToolsUi(locale);
  return {
    title: ui.diffMetaTitle,
    description: ui.diffMetaDescription,
    alternates,
    openGraph: withPublicOg({
      title: ui.diffMetaTitle,
      description: ui.diffMetaDescription,
      url: canonicalUrl,
      siteName: 'Readfox',
      type: 'website',
    }),
    twitter: buildPublicTwitter(ui.diffMetaTitle, ui.diffMetaDescription),
  };
}

export default async function TextDifficultyPage() {
  const [locale, localePrefix, { canonicalUrl }] = await Promise.all([
    getLocale(),
    activePublicLocalePrefix(),
    publicAlternatesForRequest('/tools/text-difficulty'),
  ]);
  const ui = getToolsUi(locale);
  const allBooks = listPublicBooks();

  // Keep RSC payload lean: at most 4 representative books per CEFR level per language.
  const booksByLang: Record<DifficultyLanguage, DifficultyBookPick[]> = { en: [], fr: [], es: [] };
  const perLevelCount = new Map<string, number>();
  for (const book of allBooks) {
    if (book.language !== 'en' && book.language !== 'fr' && book.language !== 'es') continue;
    const bucket = `${book.language}:${book.level}`;
    const seen = perLevelCount.get(bucket) ?? 0;
    if (seen >= 4) continue;
    perLevelCount.set(bucket, seen + 1);
    booksByLang[book.language].push({
      slug: book.slug,
      language: book.language,
      title: pickLocalized(book.titles, locale, book.title),
      author: book.author,
      level: book.level,
      wordCount: book.wordCount,
    });
  }

  const isZhCn = locale === 'zh-CN';
  const isZhTw = locale === 'zh-TW';
  // Serialize only the ~25 words needed for the default sample (~2 KB vs 508 KB full lexicon).
  const initialEnSampleLexicon = loadSampleLexiconSubset(
    'en',
    TEXT_DIFFICULTY_SAMPLES.en[1].text,
    { includeZh: isZhCn || isZhTw },
  );

  const faq = isZhCn
    ? [
        {
          q: '这个 CEFR 文本难度检测器是如何估算等级的？',
          a: '工具结合词频排名（第 90 百分位词汇难度、高阶生词占比）以及平均句长，在浏览器本地即时计算 A1–C2 预估等级，无需注册也不上传你的私人文本。',
        },
        {
          q: '支持哪些语言的段落检测？',
          a: '目前支持英语（English）、法语（Français）和西班牙语（Español）三语词频分析，并同步匹配 Readfox 免费书库里的同等级分级原著。',
        },
        {
          q: '想看某个多义词在当前句子里的准确含义怎么办？',
          a: '点击高亮生词可先看基础词典释义；注册免费 Readfox 账号后，导入整篇文章或 EPUB，点击任意单词即可用 AI 结合整句话给出「在这句话里」的精准解释。',
        },
      ]
    : isZhTw
      ? [
          {
            q: '這個 CEFR 文本難度檢測器如何估算等級？',
            a: '工具結合詞頻排名與平均句長，在瀏覽器本機即時計算 A1–C2 預估等級，免註冊且不會上傳你的私人文章。',
          },
          {
            q: '支援哪些語言的段落檢測？',
            a: '目前支援英語、法語與西班牙語詞頻分析，並推薦 Readfox 免費書庫中對應難度的分級原著。',
          },
          {
            q: '想看單字在這句話裡的精確意思怎麼辦？',
            a: '點擊高亮生字可先看基礎釋義；登入免費 Readfox 帳號後即可使用 AI 結合整句的語境精講與 FSRS 複習。',
          },
        ]
      : [
          {
            q: 'How does the CEFR text difficulty checker estimate reading level?',
            a: 'It combines word-frequency rank distribution (90th-percentile vocabulary ceiling and advanced/rare word density) with average sentence length directly in your browser—no sign-up and no text sent to external AI servers.',
          },
          {
            q: 'Which languages are supported?',
            a: 'English, French, and Spanish are supported using frequency-ranked dictionaries built from Readfox’s vocabulary pools, paired with matched A1–C2 free graded books.',
          },
          {
            q: 'How do I get full contextual explanations for every word in my passage?',
            a: 'Tap any highlighted word above for its frequency rank and dictionary gloss. To get AI “In this sentence” explanations, sentence breakdowns, and FSRS review, open the passage in a free Readfox account.',
          },
        ];

  const structured = toolPageJsonLd({
    url: canonicalUrl,
    title: ui.diffTitle,
    description: ui.diffMetaDescription,
    homeLabel: ui.breadcrumbHome,
    toolsLabel: ui.breadcrumbTools,
    localePrefix,
    inLanguage: locale,
    faq,
    isWebApp: true,
  });

  return (
    <LegalShell title={ui.diffTitle} wide>
      {structured.map((entry, idx) => (
        <JsonLd key={idx} data={entry} />
      ))}

      <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">{ui.diffIntro}</p>

      <TextDifficultyTool
        locale={locale}
        initialEnSampleLexicon={initialEnSampleLexicon}
        booksByLang={booksByLang}
      />

      <section className="space-y-2 pt-2" data-testid="diff-faq">
        <H2>{ui.faqHeading}</H2>
        {faq.map(({ q, a }) => (
          <details key={q} className="border-b border-border">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">{q}</summary>
            <p className="max-w-prose pb-4 text-sm leading-relaxed text-muted-foreground">{a}</p>
          </details>
        ))}
      </section>

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <PublicLink href="/tools" className="underline hover:text-foreground">
          {ui.allToolsLink}
        </PublicLink>
        <PublicLink href="/vocab-test" className="underline hover:text-foreground">
          {ui.vocabTestCta}
        </PublicLink>
        <PublicLink href="/books" className="underline hover:text-foreground">
          {ui.browseBooksCta.replace('{books}', String(allBooks.length))}
        </PublicLink>
        <PublicLink href="/alternatives" className="underline hover:text-foreground">
          {ui.alternativesLink}
        </PublicLink>
      </p>
    </LegalShell>
  );
}
