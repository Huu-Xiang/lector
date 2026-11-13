'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react';
import {
  addLibraryBook,
  getSetting,
  seedStarterContent,
  setDailyGoal,
  setSetting,
} from '@/lib/data-layer';
import { DAILY_GOAL_PRESETS, DEFAULT_DAILY_GOAL, goalKey, type DailyGoal } from '@/lib/daily-goal';
import { loadCatalog } from '@/lib/catalog-cache';
import { displayLanguage } from '@/lib/display-language';
import { readPendingBook, writePendingBook, type BookRef } from '@/lib/pending-book';
import {
  LANGUAGES,
  NATIVE_LANGUAGES,
  isNativeLanguageCode,
  learnCodeOfNative,
  nativeLanguageFromLocale,
  type LanguageCode,
} from '@/lib/languages';
import { LOCALE_COOKIE, matchLocale } from '@/i18n/locales';
import { getOnboardingSnapshot, skipOnboarding, startOnboarding } from '@/lib/onboarding';
import {
  CEFR_LEVELS,
  approximateLevelFor,
  examRefs,
  setReadingLevel,
  showMainlandExams,
  type CefrLevel,
} from '@/lib/reading-level';
import { languageDisplayName } from '@/lib/language-names';
import { forgetNative } from '@/lib/library-titles';
import { isLanguageReady, parseReadyLanguages } from '@/lib/ready-languages';
import { useReadyLanguagesSetting } from '@/lib/use-env';
import { setLanguageInStorage } from '@/utils/storage';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import RecommendedForYou from '@/components/RecommendedForYou';
import { readVocabResult, type VocabResult } from '@/lib/vocab-result';

const SETUP_GOALS = DAILY_GOAL_PRESETS.filter((goal) => goal.target <= 20);

// Registry-derived (#307): every language in LANGUAGES gets a setup card —
// no hand-kept mirror to forget when a pack lands.
const ownLanguage = (native: string) => learnCodeOfNative(native) as LanguageCode;

const languageCards: { code: LanguageCode; flag: string; native: string; name: string }[] =
  Object.values(LANGUAGES).map((lang) => ({
    code: lang.code,
    flag: lang.flag,
    native: lang.native,
    name: lang.name,
  }));

// Shown up front; every other language sits behind "Show all languages" so the
// preferences below stay on screen without scrolling past 30+ cards.
// Mirrors api/src/lib/settings-keys.ts's READING_INTERESTS allow-list.
const READING_INTERESTS = ['news', 'travel', 'science', 'literature'] as const;

const POPULAR_LANGUAGES: LanguageCode[] = [
  'en',
  'es',
  'fr',
  'de',
  'it',
  'pt',
  'ja',
  'ko',
  'zh',
  'ru',
];

export default function SetupPage() {
  const t = useTranslations('setup');
  const locale = useLocale();
  const router = useRouter();
  const [pickedLanguage, setPickedLanguage] = useState<LanguageCode | null>(null);
  const [pending, setPending] = useState<LanguageCode | null>(null);
  const [pickedLevel, setLevel] = useState<CefrLevel | null>(null);
  const [levelPicked, setLevelPicked] = useState(false);
  const [vocabResult, setVocabResult] = useState<VocabResult | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [dailyGoal, setDailyGoalChoice] = useState<DailyGoal>(DEFAULT_DAILY_GOAL);
  const goalT = useTranslations('dailyGoal');
  // The onboarding profile keeps minutes (5-120); a review goal leaves the old default.
  const profileMinutes = dailyGoal.kind === 'minutes' ? Math.max(5, dailyGoal.target) : 10;
  const [native, setNative] = useState<string>(() => nativeLanguageFromLocale(locale));
  const nativePicked = useRef(false);
  const [nativeSettingStatus, setNativeSettingStatus] = useState<
    'loading' | 'loaded' | 'unavailable'
  >('loading');
  const [stage, setStage] = useState<'form' | 'recommend'>('form');
  const tl = useTranslations('readingLevel');
  const vt = useTranslations('vocabTest');
  const tc = useTranslations('common');
  const ready = parseReadyLanguages(useReadyLanguagesSetting());
  const mainland = showMainlandExams(native, locale);
  const [error, setError] = useState<string | null>(null);
  const [showAllLanguages, setShowAllLanguages] = useState(false);
  const [pendingBook, setPendingBook] = useState<BookRef | null>(null);
  const [pendingTitle, setPendingTitle] = useState<string | null>(null);
  const bookLanguage =
    pendingBook &&
    pendingBook.language !== learnCodeOfNative(native) &&
    isLanguageReady(pendingBook.language, ready)
      ? (pendingBook.language as LanguageCode)
      : null;
  const bookSlug = pendingBook?.slug ?? null;
  const selectedLanguage =
    pickedLanguage ??
    bookLanguage ??
    (native === 'ru' && isLanguageReady('en', ready) ? 'en' : null);
  const level: CefrLevel | null =
    levelPicked || selectedLanguage !== 'en' ? pickedLevel : (vocabResult?.level ?? pickedLevel);
  function pickLevel(next: CefrLevel | null) {
    setLevelPicked(true);
    setLevel(next);
  }
  function toggleInterest(id: string) {
    setInterests((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }
  const languageName = (code: string, fallback: string) =>
    languageDisplayName(code, locale, fallback);

  // A completed/skipped guide never reappears. An explicit visit while a guide
  // is in progress resumes its real starter lesson instead of beginning again.
  useEffect(() => {
    let cancelled = false;
    getSetting<string | null>('nativeLanguage')
      .catch(() => undefined)
      .then((code) => {
        if (cancelled) return;
        setNativeSettingStatus(code === undefined ? 'unavailable' : 'loaded');
        if (nativePicked.current) return;
        const next = isNativeLanguageCode(code) ? code : nativeLanguageFromLocale(locale);
        setNative(next);
        setPickedLanguage((current) => (current === ownLanguage(next) ? null : current));
      });
    void getOnboardingSnapshot()
      .then((snapshot) => {
        if (cancelled || !snapshot.progress) return;
        if (snapshot.progress.status === 'in_progress' && snapshot.progress.recommendedLessonId) {
          router.replace(`/read/${snapshot.progress.recommendedLessonId}?onboarding=1`);
        } else if (snapshot.progress.status !== 'in_progress') {
          router.replace('/');
        }
      })
      .catch(() => {
        // The language picker remains usable; selecting a language will retry
        // through the start/skip write and surface an actionable error.
      });
    return () => {
      cancelled = true;
    };
  }, [router, locale]);

  /* eslint-disable react-hooks/set-state-in-effect -- the book a visitor chose is in localStorage */
  useEffect(() => {
    setPendingBook(readPendingBook());
  }, []);

  useEffect(() => {
    setVocabResult(readVocabResult());
  }, []);

  useEffect(() => {
    setPendingTitle(null);
    if (!bookLanguage || !bookSlug) return;
    let cancelled = false;
    const shown = displayLanguage(native, locale);
    loadCatalog(bookLanguage)
      .then((catalog) => {
        if (cancelled) return;
        const book = catalog.find((entry) => entry.slug === bookSlug);
        if (book) setPendingTitle(book.titles[shown] || book.title);
        else {
          writePendingBook(null);
          setPendingBook(null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bookLanguage, bookSlug, native, locale]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function chooseNative(code: string) {
    nativePicked.current = true;
    setNative(code);
    setPickedLanguage((current) => (current === ownLanguage(code) ? null : current));
    const ui = matchLocale(code);
    if (ui && ui !== locale) {
      document.cookie = `${LOCALE_COOKIE}=${ui}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    }
  }

  async function handleContinue(guided: boolean) {
    if (!selectedLanguage || pending || nativeSettingStatus === 'loading') return;
    const code = selectedLanguage;
    setPending(selectedLanguage);
    setError(null);

    try {
      if (nativePicked.current || nativeSettingStatus === 'loaded') {
        try {
          await setSetting('nativeLanguage', native);
          forgetNative();
        } catch {}
      }

      // Seeding is safe before the target-language write: the route accepts an
      // explicit language and is idempotent. /onboarding/start or /skip then
      // atomically persists the profile, progress and target language.
      if (level) await setReadingLevel(code, level).catch(() => {});
      if (interests.length > 0) {
        await setSetting('readingInterests', interests).catch(() => {});
      }
      await setDailyGoal(dailyGoal).catch(() => {});
      const starter = await seedStarterContent(code);
      const profile = {
        language: code,
        approximateLevel: approximateLevelFor(level),
        interests: [],
        dailyMinutes: profileMinutes,
      };

      if (guided && pendingBook && pendingBook.language === code) {
        const collectionId = await addLibraryBook(code, pendingBook.slug).catch(() => null);
        writePendingBook(null);
        if (collectionId) {
          await startWith(collectionId);
          return;
        }
      }

      if (guided && starter.recommendedLessonId) {
        await startOnboarding({
          ...profile,
          starterCollectionId: starter.collectionId,
          recommendedLessonId: starter.recommendedLessonId,
          recommendedLessonTitle: starter.recommendedLessonTitle,
        });
        setLanguageInStorage(code);
        router.replace(`/read/${starter.recommendedLessonId}?onboarding=1`);
        return;
      }

      if (guided) {
        setStage('recommend');
        setPending(null);
        window.scrollTo({ top: 0 });
        return;
      }

      await skipOnboarding(profile);
      setLanguageInStorage(code);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errSave'));
      setPending(null);
    }
  }

  const levelLabel = level ? `${level} · ${tl(`names.${level}`)}` : tl('notSure');

  async function startWith(collectionId: string) {
    if (!selectedLanguage) return;
    const snapshot = await startOnboarding({
      language: selectedLanguage,
      approximateLevel: approximateLevelFor(level),
      interests: [],
      dailyMinutes: profileMinutes,
      starterCollectionId: collectionId,
    });
    setLanguageInStorage(selectedLanguage);
    const lessonId = snapshot.progress?.recommendedLessonId;
    router.replace(lessonId ? `/read/${lessonId}?onboarding=1` : '/');
  }

  async function skipRecommendations() {
    if (!selectedLanguage || pending) return;
    setPending(selectedLanguage);
    try {
      await skipOnboarding({
        language: selectedLanguage,
        approximateLevel: approximateLevelFor(level),
        interests: [],
        dailyMinutes: profileMinutes,
      });
      setLanguageInStorage(selectedLanguage);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errSave'));
      setPending(null);
    }
  }

  const chosenTitle = selectedLanguage === bookLanguage ? pendingTitle : null;
  const ownCode = ownLanguage(native);
  const offeredCards = languageCards.filter((lang) => lang.code !== ownCode);
  const readyCards = ready
    ? [...ready]
        .map((code) => offeredCards.find((lang) => lang.code === code))
        .filter((lang): lang is (typeof languageCards)[number] => lang !== undefined)
    : offeredCards.filter((lang) => POPULAR_LANGUAGES.includes(lang.code));
  const readyCodes = new Set(readyCards.map((lang) => lang.code));
  const restCards = offeredCards.filter((lang) => !readyCodes.has(lang.code));
  const expanded =
    showAllLanguages ||
    (ready === null && selectedLanguage !== null && !readyCodes.has(selectedLanguage));
  const visibleLanguageCards = expanded ? [...readyCards, ...restCards] : readyCards;
  const hiddenLanguageCount = offeredCards.length - visibleLanguageCards.length;

  return (
    <main className="setup-page min-h-svh bg-background px-4 py-4 sm:py-16">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-5 sm:mb-8 sm:text-center">
          <Image
            src="/logo.png"
            alt=""
            width={56}
            height={56}
            priority
            className="mx-auto mb-3 hidden rounded-xl sm:block"
          />
          <p className="mb-4 hidden text-lg font-bold tracking-tight text-foreground sm:block">
            {tc('appName')}
          </p>
          <div className="mb-3 hidden items-center gap-2 rounded-full bg-[var(--primary-soft)] px-3 py-1 text-sm font-semibold text-[var(--primary-text)] sm:inline-flex">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {stage === 'form' ? t('badge') : t('recommendBadge')}
          </div>
          <h1 className="mb-1.5 text-2xl font-bold tracking-tight text-foreground sm:mb-3 sm:text-3xl">
            {stage === 'form' ? t('welcome') : t('recommendTitle')}
          </h1>
          <p className="mx-auto max-w-xl text-sm text-muted-foreground sm:text-lg">
            {stage === 'form' ? t('intro') : t('recommendIntro', { level: levelLabel })}
          </p>
        </div>

        {stage === 'recommend' && selectedLanguage && (
          <section aria-label={t('recommendTitle')} data-testid="setup-recommend">
            <RecommendedForYou
              language={selectedLanguage}
              level={level}
              interests={interests}
              nativeLanguage={native}
              onStart={startWith}
            />
            <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStage('form')}
                disabled={pending !== null}
                data-testid="setup-recommend-back"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                {t('recommendBack')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void skipRecommendations()}
                disabled={pending !== null}
                data-testid="setup-recommend-skip"
              >
                {t('recommendSkip')}
              </Button>
            </div>
            {error && (
              <p className="mt-4 text-center text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </section>
        )}

        {stage === 'form' && (
          <>
            <section aria-labelledby="native-heading" className="mb-4 sm:mb-8">
              <h2 id="native-heading" className="mb-1 text-sm font-bold text-foreground">
                {t('nativeTitle')}
              </h2>
              <p className="mb-2 text-sm text-muted-foreground sm:mb-3">{t('nativeHint')}</p>
              <div className="sm:w-80">
                <Select
                  value={native}
                  onChange={(e) => chooseNative(e.target.value)}
                  aria-labelledby="native-heading"
                  data-testid="setup-native-language"
                  className="min-h-11 bg-card sm:min-h-10"
                >
                  {NATIVE_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.native}
                    </option>
                  ))}
                </Select>
              </div>
            </section>

            <section aria-labelledby="language-heading" className="mb-4 sm:mb-8">
              <h2 id="language-heading" className="mb-3 text-sm font-bold text-foreground">
                {t('chooseLanguage')}
              </h2>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8.5rem),1fr))] gap-2 sm:grid-cols-3 sm:gap-3">
                {visibleLanguageCards.map((lang) => {
                  const soon = !isLanguageReady(lang.code, ready);
                  const active = selectedLanguage === lang.code;
                  const name = languageName(lang.code, lang.name);
                  return (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => setPickedLanguage(lang.code)}
                      disabled={pending !== null || soon}
                      data-testid={`setup-language-${lang.code}`}
                      aria-label={t('learn', { name })}
                      aria-pressed={active}
                      className={`relative flex min-h-14 cursor-pointer flex-col items-start justify-center rounded-xl border px-3 py-2 pe-7 text-start focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none motion-safe:transition-colors sm:min-h-36 sm:items-center sm:gap-2 sm:rounded-2xl sm:border-2 sm:px-4 sm:py-5 sm:text-center ${
                        active
                          ? 'border-primary bg-[var(--primary-soft)]'
                          : soon
                            ? 'cursor-not-allowed border-border bg-card opacity-60'
                            : pending !== null
                              ? 'cursor-not-allowed border-border bg-card opacity-50'
                              : 'border-border bg-card hover:border-primary hover:shadow-md'
                      }`}
                    >
                      <span className="language-emoji hidden text-4xl sm:block" aria-hidden="true">
                        {lang.flag}
                      </span>
                      <span className="max-w-full text-sm font-semibold break-words text-foreground sm:text-lg">
                        {lang.native}
                      </span>
                      <span
                        className={`max-w-full text-xs break-words text-muted-foreground ${name === lang.native ? 'hidden sm:block' : ''}`}
                      >
                        {name}
                      </span>
                      {active && (
                        <Check className="absolute end-2 top-2 size-4 text-primary" aria-hidden />
                      )}
                      {soon && (
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                          {t('inDevelopment')}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {hiddenLanguageCount > 0 && (
                <div className="mt-1 sm:mt-3 sm:text-center">
                  <button
                    type="button"
                    data-testid="setup-language-show-all"
                    onClick={() => setShowAllLanguages(true)}
                    className="min-h-11 cursor-pointer text-start text-sm font-medium text-primary hover:underline"
                  >
                    {ready
                      ? t('showMoreSoon', { count: hiddenLanguageCount })
                      : t('showMore', { count: hiddenLanguageCount })}
                  </button>
                </div>
              )}
            </section>

            <section
              aria-labelledby="preferences-heading"
              className="mb-4 rounded-xl border border-border bg-card p-3 sm:mb-6 sm:rounded-2xl sm:p-6"
            >
              <div className="mb-3 flex items-start justify-between gap-3 sm:mb-5">
                <div>
                  <h2 id="preferences-heading" className="text-sm font-bold text-foreground">
                    {t('personalise')}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">{t('personaliseHint')}</p>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {t('optional')}
                </span>
              </div>

              <fieldset>
                <legend className="mb-2 text-xs font-semibold text-muted-foreground">
                  {t('level')}
                </legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {CEFR_LEVELS.map((option) => {
                    const exams = selectedLanguage
                      ? examRefs(selectedLanguage, option, mainland)
                          .map((ref) => tl(`exam.${ref.exam}`, { score: ref.score ?? '' }))
                          .join(' · ')
                      : '';
                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={level === option}
                        onClick={() => pickLevel(option)}
                        data-testid={`setup-level-${option}`}
                        className={`min-h-11 cursor-pointer rounded-xl border px-3 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                          level === option
                            ? 'border-primary bg-[var(--primary-soft)] text-[var(--primary-text)]'
                            : 'border-border bg-background text-foreground hover:bg-accent'
                        }`}
                      >
                        <span className="font-semibold">{option}</span>
                        <span className="ml-1.5 font-medium">{tl(`names.${option}`)}</span>
                        {exams && (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {exams}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    aria-pressed={level === null}
                    onClick={() => pickLevel(null)}
                    data-testid="setup-level-unsure"
                    className={`min-h-11 cursor-pointer rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                      level === null
                        ? 'border-primary bg-[var(--primary-soft)] text-[var(--primary-text)]'
                        : 'border-border bg-background text-foreground hover:bg-accent'
                    }`}
                  >
                    {tl('notSure')}
                  </button>
                  {(selectedLanguage === null || selectedLanguage === 'en') && (
                    <Link
                      href="/vocab-test?from=setup"
                      data-testid="setup-vocab-test-link"
                      className="flex min-h-11 items-center px-1 text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:col-span-2"
                    >
                      {vt('setupLink')}
                    </Link>
                  )}
                </div>
                {vocabResult && selectedLanguage === 'en' && (
                  <p className="mt-2 text-xs text-muted-foreground" data-testid="setup-vocab-note">
                    {vt('setupNote', { count: vocabResult.estimate })}
                  </p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">{t('levelHint')}</p>
              </fieldset>

              <fieldset className="mt-5">
                <legend className="mb-2 text-xs font-semibold text-muted-foreground">
                  {t('interests')}
                </legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {READING_INTERESTS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={interests.includes(id)}
                      onClick={() => toggleInterest(id)}
                      data-testid={`setup-interest-${id}`}
                      className={`min-h-11 cursor-pointer rounded-xl border px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                        interests.includes(id)
                          ? 'border-primary bg-[var(--primary-soft)] text-[var(--primary-text)]'
                          : 'border-border bg-background text-foreground hover:bg-accent'
                      }`}
                    >
                      {t(`interest.${id}`)}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{t('interestsHint')}</p>
              </fieldset>

              <fieldset className="mt-5">
                <legend className="mb-2 text-xs font-semibold text-muted-foreground">
                  {goalT('setupTitle')}
                </legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {SETUP_GOALS.map((goal) => {
                    const chosen = goalKey(goal) === goalKey(dailyGoal);
                    return (
                      <button
                        key={goalKey(goal)}
                        type="button"
                        aria-pressed={chosen}
                        onClick={() => setDailyGoalChoice(goal)}
                        data-testid={`setup-goal-${goal.kind}-${goal.target}`}
                        className={`min-h-11 cursor-pointer rounded-xl border px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                          chosen
                            ? 'border-primary bg-[var(--primary-soft)] text-[var(--primary-text)]'
                            : 'border-border bg-background text-foreground hover:bg-accent'
                        }`}
                      >
                        {goalT(`preset.${goal.kind}`, { count: goal.target })}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{goalT('setupHint')}</p>
              </fieldset>
            </section>

            <div
              className="sticky bottom-[env(safe-area-inset-bottom)] z-10 rounded-xl border border-border bg-card p-1.5 shadow-md sm:bottom-3 sm:rounded-2xl sm:px-5 sm:py-4"
              data-testid="setup-start-bar"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="hidden sm:block">
                  <p className="text-sm font-semibold text-foreground">{t('ready')}</p>
                  {chosenTitle ? (
                    <p className="mt-0.5 text-sm text-foreground" data-testid="setup-pending-book">
                      {t('pendingBook', { title: chosenTitle })}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-muted-foreground">{t('readyHint')}</p>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-wrap items-stretch gap-1 sm:flex-none sm:gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleContinue(false)}
                    disabled={
                      !selectedLanguage || pending !== null || nativeSettingStatus === 'loading'
                    }
                    className="h-auto min-h-11 shrink px-2 py-1 whitespace-normal sm:px-4"
                    data-testid="skip-guided-onboarding"
                  >
                    {t('skip')}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => handleContinue(true)}
                    disabled={
                      !selectedLanguage || pending !== null || nativeSettingStatus === 'loading'
                    }
                    className="h-auto min-h-11 min-w-0 grow basis-40 px-2 py-1 whitespace-normal sm:flex-none sm:px-4"
                    data-testid="start-guided-onboarding"
                  >
                    {pending ? (
                      t('preparing')
                    ) : chosenTitle ? (
                      <span className="min-w-0 break-words sm:max-w-[20rem]">
                        {t('startBook', { title: chosenTitle })}
                      </span>
                    ) : (
                      t('start')
                    )}
                    {!pending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                  </Button>
                </div>
              </div>
            </div>

            {error && (
              <p className="mt-4 text-center text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
