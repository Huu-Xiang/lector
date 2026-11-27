'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Sparkles, BookOpen, BarChart3, RotateCcw } from 'lucide-react';
import { ClientPublicLink } from '@/components/PublicLink/client';
import {
  TEXT_DIFFICULTY_SAMPLES,
  analyzeTextDifficulty,
  type DifficultyLanguage,
  type HardWordSummary,
  type LexiconMap,
} from '@/lib/text-difficulty';
import { examRefs, type CefrLevel } from '@/lib/reading-level';

export interface DifficultyBookPick {
  slug: string;
  language: DifficultyLanguage;
  title: string;
  author: string;
  level: string;
  wordCount: number;
}

interface Props {
  locale: string;
  initialEnSampleLexicon: LexiconMap;
  booksByLang: Record<DifficultyLanguage, DifficultyBookPick[]>;
}

const MAX_TEXT_CHARS = 15000;

const LANG_LABELS: Record<DifficultyLanguage, string> = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
};

const EXAM_NAMES: Record<string, string> = {
  ielts: 'IELTS',
  toefl: 'TOEFL iBT',
  delf: 'DELF',
  dalf: 'DALF',
  cet4: 'CET-4',
  cet6: 'CET-6',
  tem8: 'TEM-8',
  gaokao: 'Gaokao',
  zhongkao: 'Zhongkao',
  juniorHigh: 'Junior High',
};

function formatExamTag(exam: string, score?: string): string {
  const base = EXAM_NAMES[exam] ?? exam.toUpperCase();
  return score ? `${base} ${score}` : base;
}

const CEFR_ORDER: Record<CefrLevel, number> = {
  A1: 0,
  A2: 1,
  B1: 2,
  B2: 3,
  C1: 4,
  C2: 5,
};

const ALL_SAMPLE_TEXTS = new Set<string>(
  Object.values(TEXT_DIFFICULTY_SAMPLES).flatMap((list) => list.map((s) => s.text)),
);

export default function TextDifficultyTool({
  locale,
  initialEnSampleLexicon,
  booksByLang,
}: Props) {
  const isZhCn = locale === 'zh-CN';
  const isZhTw = locale === 'zh-TW';
  const isZh = isZhCn || isZhTw;

  const [language, setLanguage] = useState<DifficultyLanguage>('en');
  const [text, setText] = useState<string>(TEXT_DIFFICULTY_SAMPLES.en[1].text);
  const [lexicons, setLexicons] = useState<Partial<Record<DifficultyLanguage, LexiconMap>>>({
    en: initialEnSampleLexicon,
  });
  const [loadedFull, setLoadedFull] = useState<Partial<Record<DifficultyLanguage, boolean>>>({});
  const [loadingLang, setLoadingLang] = useState<DifficultyLanguage | null>(null);
  const [loadErrorLang, setLoadErrorLang] = useState<DifficultyLanguage | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [selectedWord, setSelectedWord] = useState<HardWordSummary | null>(null);

  useEffect(() => {
    if (loadedFull[language]) {
      setLoadingLang(null);
      setLoadErrorLang(null);
      return;
    }
    const controller = new AbortController();
    setLoadingLang(language);
    setLoadErrorLang(null);

    fetch(
      `/tools/text-difficulty/lexicon?lang=${language}&locale=${encodeURIComponent(locale)}`,
      { signal: controller.signal },
    )
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ entries?: LexiconMap }>;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        if (payload?.entries) {
          setLexicons((prev) => ({ ...prev, [language]: payload.entries }));
          setLoadedFull((prev) => ({ ...prev, [language]: true }));
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        setLoadErrorLang(language);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingLang(null);
        }
      });

    return () => {
      controller.abort();
    };
  }, [language, loadedFull, locale, retryNonce]);

  const activeLexicon = lexicons[language] ?? {};
  const result = useMemo(
    () => analyzeTextDifficulty(text, language, activeLexicon),
    [text, language, activeLexicon],
  );

  const exams = useMemo(
    () => examRefs(language, result.cefr, isZhCn),
    [language, result.cefr, isZhCn],
  );

  const matchedBooks = useMemo(() => {
    const pool = booksByLang[language] ?? [];
    const targetIdx = CEFR_ORDER[result.cefr] ?? 2;
    return [...pool]
      .sort((a, b) => {
        const da = Math.abs((CEFR_ORDER[a.level as CefrLevel] ?? 2) - targetIdx);
        const db = Math.abs((CEFR_ORDER[b.level as CefrLevel] ?? 2) - targetIdx);
        if (da !== db) return da - db;
        return a.wordCount - b.wordCount;
      })
      .slice(0, 4);
  }, [booksByLang, language, result.cefr]);

  const handleLanguageChange = (next: DifficultyLanguage) => {
    setLanguage(next);
    // Preserve custom user-pasted text; only swap when empty or showing a built-in sample.
    if (!text.trim() || ALL_SAMPLE_TEXTS.has(text)) {
      setText(TEXT_DIFFICULTY_SAMPLES[next][1].text);
    }
    setSelectedWord(null);
  };

  const tText = (en: string, zhCn: string, zhTw: string) =>
    isZhCn ? zhCn : isZhTw ? zhTw : en;

  return (
    <div className="space-y-6" data-testid="text-difficulty-tool">
      {/* Controls + Sample chips */}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Text language">
            {(['en', 'fr', 'es'] as const).map((code) => (
              <button
                key={code}
                type="button"
                role="tab"
                aria-selected={language === code}
                onClick={() => handleLanguageChange(code)}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  language === code
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-muted/50 text-foreground hover:bg-muted'
                }`}
                data-testid={`diff-lang-${code}`}
              >
                {LANG_LABELS[code]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {TEXT_DIFFICULTY_SAMPLES[language].map((sample, idx) => (
              <button
                key={sample.label}
                type="button"
                onClick={() => {
                  setText(sample.text);
                  setSelectedWord(null);
                }}
                className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
                data-testid={`diff-sample-${idx}`}
              >
                {sample.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setText('');
                setSelectedWord(null);
              }}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              {tText('Clear', '清空', '清除')}
            </button>
          </div>
        </div>

        <label htmlFor="cefr-text-input" className="sr-only">
          {tText('Paste text to analyze', '粘贴要检测的外文段落', '貼上要檢測的外文段落')}
        </label>
        <textarea
          id="cefr-text-input"
          value={text}
          onChange={(e) => {
            setText(e.target.value.slice(0, MAX_TEXT_CHARS));
            setSelectedWord(null);
          }}
          rows={5}
          placeholder={tText(
            'Paste any English, French, or Spanish article, exam passage, or book excerpt here…',
            '在这里粘贴一段英文、法文或西文文章、小说或真题段落…',
            '在此貼上英文、法文或西文文章、小說或書摘…',
          )}
          className="w-full rounded-xl border border-input bg-background px-4 py-3 font-serif text-base leading-relaxed text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
          data-testid="diff-textarea"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            {loadingLang === language ? (
              <span>
                {tText('Loading frequency lexicon…', '正在加载词频词库…', '正在載入詞頻詞庫…')}
              </span>
            ) : loadErrorLang === language ? (
              <>
                <span className="text-destructive">
                  {tText(
                    'Full dictionary failed to load (using basic estimate).',
                    '完整词频表加载失败（当前使用基础估算）。',
                    '完整詞頻表載入失敗（目前使用基礎估算）。',
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setRetryNonce((n) => n + 1)}
                  className="font-semibold text-primary underline"
                >
                  {tText('Retry', '重试', '重試')}
                </button>
              </>
            ) : (
              <span>
                {tText(
                  'Instant browser analysis — no sign-up required',
                  '实时本地分析，无需登录',
                  '即時本機分析，無需登入',
                )}
              </span>
            )}
          </div>
          <span>
            {text.length.toLocaleString(locale)} / {MAX_TEXT_CHARS.toLocaleString(locale)}
          </span>
        </div>

        {result.hasUnsupportedScript && (
          <p className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {tText(
              'This checker currently analyzes English, French, and Spanish text. Paste a Latin-script passage to measure CEFR difficulty.',
              '当前难度检测器支持英语、法语和西班牙语段落，请粘贴对应外文文本进行分析。',
              '目前難度檢測器支援英語、法語與西班牙語段落，請貼上對應外文進行分析。',
            )}
          </p>
        )}
      </div>

      {/* Summary metrics */}
      <div className="grid gap-3 sm:grid-cols-4" data-testid="diff-summary-cards">
        <div className="rounded-xl border border-primary/35 bg-[var(--primary-soft)]/50 p-4">
          <div className="text-xs font-semibold text-primary">
            {tText('Estimated CEFR', '预估 CEFR 难度', '預估 CEFR 難度')}
          </div>
          <div
            className="mt-1 text-3xl font-extrabold tracking-tight text-foreground"
            data-testid="diff-cefr-badge"
          >
            {result.wordCount > 0 ? result.cefr : '—'}
          </div>
          {exams.length > 0 && result.wordCount > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {exams.slice(0, 3).map((ref) => (
                <span
                  key={`${ref.exam}-${ref.score ?? ''}`}
                  className="rounded bg-card px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                >
                  {formatExamTag(ref.exam, ref.score)}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs font-medium text-muted-foreground">
            {tText('Recommended vocabulary', '建议阅读词汇量', '建議閱讀字彙量')}
          </div>
          <div className="mt-1 text-2xl font-bold text-foreground">
            {result.wordCount > 0 ? `~${result.recommendedVocab.toLocaleString(locale)}` : '—'}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {tText('for ~95% smooth reading', '约 95% 流畅理解门槛', '約 95% 流暢閱讀門檻')}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs font-medium text-muted-foreground">
            {tText('Top-2000 coverage', '常见词覆盖率', '常見字覆蓋率')}
          </div>
          <div className="mt-1 text-2xl font-bold text-foreground">
            {result.wordCount > 0 ? `${result.commonCoveragePct}%` : '—'}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {tText(
              `${result.hardWordPct}% advanced/rare words`,
              `高阶词占比 ${result.hardWordPct}%`,
              `進階字佔比 ${result.hardWordPct}%`,
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs font-medium text-muted-foreground">
            {tText('Words & sentence length', '词数与平均句长', '字數與平均句長')}
          </div>
          <div className="mt-1 text-2xl font-bold text-foreground">
            {result.wordCount.toLocaleString(locale)}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              {tText('words', '词', '字')}
            </span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {tText(
              `${result.uniqueWords.toLocaleString(locale)} unique · avg ${result.avgSentenceLength} words/sent`,
              `${result.uniqueWords.toLocaleString(locale)} 个不重复词 · 均句 ${result.avgSentenceLength} 词`,
              `${result.uniqueWords.toLocaleString(locale)} 個不重複字 · 均句 ${result.avgSentenceLength} 字`,
            )}
          </div>
        </div>
      </div>

      {/* Interactive highlighted reader + inline lookup card */}
      {result.wordCount > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="space-y-3 rounded-2xl border border-border bg-card p-5 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
                <span>
                  {tText(
                    'Highlighted words (tap any highlighted word)',
                    '难词高亮预览（点击任意高亮词查释义）',
                    '難字高亮預覽（點擊任意高亮字查釋義）',
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded border border-[var(--w-l3-bd)] bg-[var(--w-l3-bg)] px-1.5 py-0.5 text-[var(--w-l3-fg)]">
                  B1–B2
                </span>
                <span className="rounded border border-[var(--w-l1-bd)] bg-[var(--w-l1-bg)] px-1.5 py-0.5 text-[var(--w-l1-fg)]">
                  C1–C2
                </span>
              </div>
            </div>

            <div
              className="rounded-xl border border-border bg-background/70 p-4 font-serif text-lg leading-relaxed text-foreground"
              data-testid="diff-annotated-text"
            >
              {result.tokens.map((tok, idx) => {
                if (!tok.isWord || tok.band === 'common' || tok.band === null) {
                  return <span key={idx}>{tok.text}</span>;
                }
                const isSelected = selectedWord?.normalized === tok.normalized;
                const bandStyle =
                  tok.band === 'intermediate'
                    ? 'border-[var(--w-l3-bd)] bg-[var(--w-l3-bg)] text-[var(--w-l3-fg)]'
                    : 'border-[var(--w-l1-bd)] bg-[var(--w-l1-bg)] text-[var(--w-l1-fg)]';
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      const hit = result.hardWords.find((w) => w.normalized === tok.normalized);
                      setSelectedWord(
                        hit ?? {
                          word: tok.text,
                          normalized: tok.normalized,
                          rank: typeof tok.rank === 'number' ? tok.rank : 8000,
                          band: tok.band as 'intermediate' | 'advanced' | 'rare',
                          count: 1,
                          pos: tok.entry?.p,
                          en: tok.entry?.en,
                          zh: tok.entry?.zh,
                        },
                      );
                    }}
                    className={`inline rounded border px-1 py-0.25 transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : `${bandStyle} hover:brightness-95`
                    }`}
                  >
                    {tok.text}
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5">
            {selectedWord ? (
              <div className="space-y-3" data-testid="diff-word-popover">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-serif text-2xl font-bold text-foreground">
                    {selectedWord.word}
                  </h3>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                    #{selectedWord.rank.toLocaleString(locale)}
                  </span>
                </div>
                {selectedWord.pos && (
                  <span className="inline-block rounded bg-[var(--primary-soft)] px-2 py-0.5 font-serif text-xs font-semibold italic text-primary">
                    {selectedWord.pos}
                  </span>
                )}
                {selectedWord.zh && isZh && (
                  <p className="text-base font-semibold text-foreground">{selectedWord.zh}</p>
                )}
                {selectedWord.en && (
                  <p className="text-sm leading-relaxed text-muted-foreground">{selectedWord.en}</p>
                )}
                {!selectedWord.en && !selectedWord.zh && (
                  <p className="text-sm text-muted-foreground">
                    {tText(
                      'Outside the core high-frequency pool—open in Readfox to get an instant AI explanation in sentence context.',
                      '该词超出基础高频词表，建议在 Readfox 中结合当前整句话查看 AI 语境精讲。',
                      '此單字超出基礎高頻詞表，建議在 Readfox 中結合整句查看 AI 語境精講。',
                    )}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  <span>{tText('Notable harder words', '重点难词清单', '重點難字清單')}</span>
                </div>
                {result.hardWords.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {result.hardWords.slice(0, 12).map((item) => (
                      <button
                        key={item.normalized}
                        type="button"
                        onClick={() => setSelectedWord(item)}
                        className="rounded-lg border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground hover:border-primary/40 hover:bg-[var(--primary-soft)]/40"
                      >
                        {item.word}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {tText(
                      'Almost every word here is in the top-2,000 common pool—very accessible reading.',
                      '这段文字几乎全由高频基础词构成，阅读非常轻松！',
                      '這段文字幾乎全由高頻基礎字構成，閱讀相當輕鬆！',
                    )}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2 rounded-xl border border-primary/25 bg-[var(--primary-soft)]/40 p-3.5">
              <p className="text-xs leading-relaxed text-foreground">
                {tText(
                  'Want AI to explain each word in this exact sentence and save it to FSRS review?',
                  '想看每个词在「当前句子」里的精确意思、拆解长难句并存入 FSRS 复习？',
                  '想看每個單字在「這句話裡」的精確意思，並直接存入 FSRS 複習？',
                )}
              </p>
              <Link
                href="/register"
                className="inline-block w-full rounded-lg bg-primary px-3 py-2 text-center text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                {tText(
                  'Read this passage in Readfox (free)',
                  '免费打开 Readfox 阅读这段文字',
                  '免費開啟 Readfox 閱讀這段文字',
                )}
              </Link>
            </div>
          </aside>
        </div>
      )}

      {/* Matched free graded books */}
      {matchedBooks.length > 0 && result.wordCount > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
              <BookOpen className="h-5 w-5 text-primary" aria-hidden="true" />
              <span>
                {tText(
                  `Free ${LANG_LABELS[language]} books near ${result.cefr}`,
                  `适合 ${result.cefr} 难度的免费分级原著`,
                  `適合 ${result.cefr} 難度的免費分級原著`,
                )}
              </span>
            </h2>
            <ClientPublicLink
              href={`/books/${language}`}
              className="text-xs font-semibold text-primary hover:underline"
            >
              {tText('Browse full library →', '查看全部书库 →', '瀏覽全部書庫 →')}
            </ClientPublicLink>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {matchedBooks.map((book) => (
              <ClientPublicLink
                key={book.slug}
                href={`/books/${book.language}/${book.slug}`}
                className="flex flex-col justify-between gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
              >
                <div>
                  <span className="inline-block rounded bg-[var(--primary-soft)] px-2 py-0.5 text-xs font-bold text-primary">
                    {book.level}
                  </span>
                  <div className="mt-2 font-semibold text-foreground">{book.title}</div>
                  <div className="text-xs text-muted-foreground">{book.author}</div>
                </div>
                <div className="text-xs text-muted-foreground">
                  ~{book.wordCount.toLocaleString(locale)} {tText('words', '词', '字')}
                </div>
              </ClientPublicLink>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
