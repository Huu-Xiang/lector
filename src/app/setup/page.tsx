'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { getSetting, seedStarterContent, setSetting } from '@/lib/data-layer';
import {
  LANGUAGES,
  NATIVE_LANGUAGES,
  isNativeLanguageCode,
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
import { isLanguageReady, parseReadyLanguages } from '@/lib/ready-languages';
import { useReadyLanguagesSetting } from '@/lib/use-env';
import { setLanguageInStorage } from '@/utils/storage';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import RecommendedForYou from '@/components/RecommendedForYou';

// Registry-derived (#307): every language in LANGUAGES gets a setup card —
// no hand-kept mirror to forget when a pack lands.
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
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode | null>(null);
  const [pending, setPending] = useState<LanguageCode | null>(null);
  const [level, setLevel] = useState<CefrLevel | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [native, setNative] = useState<string>(() => nativeLanguageFromLocale(locale));
  const [stage, setStage] = useState<'form' | 'recommend'>('form');
  const tl = useTranslations('readingLevel');
  const tc = useTranslations('common');
  const ready = parseReadyLanguages(useReadyLanguagesSetting());
  const mainland = showMainlandExams(native);
  const [error, setError] = useState<string | null>(null);
  const [showAllLanguages, setShowAllLanguages] = useState(false);
  function toggleInterest(id: string) {
    setInterests((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }
  const languageName = (code: string, fallback: string) =>
    languageDisplayName(code, locale, fallback);

  // A completed/skipped guide never reappears. An explicit visit while a guide
  // is in progress resumes its real starter lesson instead of beginning again.
  useEffect(() => {
    let cancelled = false;
    getSetting<string>('nativeLanguage')
      .catch(() => undefined)
      .then((code) => {
        if (cancelled) return;
        setNative(isNativeLanguageCode(code) ? code : nativeLanguageFromLocale(locale));
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

  function chooseNative(code: string) {
    setNative(code);
    const ui = matchLocale(code);
    if (ui && ui !== locale) {
      document.cookie = `${LOCALE_COOKIE}=${ui}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    }
  }

  async function handleContinue(guided: boolean) {
    if (!selectedLanguage || pending) return;
    const code = selectedLanguage;
    setPending(selectedLanguage);
    setError(null);

    try {
      try {
        await setSetting('nativeLanguage', native);
      } catch {}

      // Seeding is safe before the target-language write: the route accepts an
      // explicit language and is idempotent. /onboarding/start or /skip then
      // atomically persists the profile, progress and target language.
      if (level) await setReadingLevel(code, level).catch(() => {});
      if (interests.length > 0) {
        await setSetting('readingInterests', interests).catch(() => {});
      }
      const starter = await seedStarterContent(code);
      const profile = {
        language: code,
        approximateLevel: approximateLevelFor(level),
        interests: [],
        dailyMinutes: 10,
      };

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
      dailyMinutes: 10,
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
        dailyMinutes: 10,
      });
      setLanguageInStorage(selectedLanguage);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errSave'));
      setPending(null);
    }
  }

  const readyCards = ready
    ? [...ready]
        .map((code) => languageCards.find((lang) => lang.code === code))
        .filter((lang): lang is (typeof languageCards)[number] => lang !== undefined)
    : languageCards.filter((lang) => POPULAR_LANGUAGES.includes(lang.code));
  const readyCodes = new Set(readyCards.map((lang) => lang.code));
  const restCards = languageCards.filter((lang) => !readyCodes.has(lang.code));
  const expanded =
    showAllLanguages ||
    (ready === null && selectedLanguage !== null && !readyCodes.has(selectedLanguage));
  const visibleLanguageCards = expanded ? [...readyCards, ...restCards] : readyCards;
  const hiddenLanguageCount = languageCards.length - visibleLanguageCards.length;

  return (
    <main className="min-h-screen bg-background px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8 text-center">
          <Image
            src="/logo.png"
            alt=""
            width={56}
            height={56}
            priority
            className="mx-auto mb-3 rounded-xl"
          />
          <p className="mb-4 text-lg font-bold tracking-tight text-foreground">{tc('appName')}</p>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[var(--primary-soft)] px-3 py-1 text-sm font-semibold text-[var(--primary-text)]">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {stage === 'form' ? t('badge') : t('recommendBadge')}
          </div>
          <h1 className="mb-3 text-3xl font-bold tracking-tight text-foreground">
            {stage === 'form' ? t('welcome') : t('recommendTitle')}
          </h1>
          <p className="mx-auto max-w-xl text-base text-muted-foreground sm:text-lg">
            {stage === 'form' ? t('intro') : t('recommendIntro', { level: levelLabel })}
          </p>
        </div>

        {stage === 'recommend' && selectedLanguage && (
          <section aria-label={t('recommendTitle')} data-testid="setup-recommend">
            <RecommendedForYou
              language={selectedLanguage}
              level={level}
              interests={interests}
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
            <section aria-labelledby="native-heading" className="mb-8">
              <h2 id="native-heading" className="mb-1 text-sm font-bold text-foreground">
                {t('nativeTitle')}
              </h2>
              <p className="mb-3 text-sm text-muted-foreground">{t('nativeHint')}</p>
              <div className="sm:w-80">
                <Select
                  value={native}
                  onChange={(e) => chooseNative(e.target.value)}
                  aria-labelledby="native-heading"
                  data-testid="setup-native-language"
                  className="h-10 bg-card"
                >
                  {NATIVE_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.native}
                    </option>
                  ))}
                </Select>
              </div>
            </section>

            <section aria-labelledby="language-heading" className="mb-8">
              <h2 id="language-heading" className="mb-3 text-sm font-bold text-foreground">
                {t('chooseLanguage')}
              </h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {visibleLanguageCards.map((lang) => {
                  const soon = !isLanguageReady(lang.code, ready);
                  return (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => setSelectedLanguage(lang.code)}
                      disabled={pending !== null || soon}
                      data-testid={`setup-language-${lang.code}`}
                      aria-label={t('learn', { name: languageName(lang.code, lang.name) })}
                      aria-pressed={selectedLanguage === lang.code}
                      className={`group flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border-2 px-4 py-5 transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none ${
                        selectedLanguage === lang.code
                          ? 'border-primary bg-[var(--primary-soft)]'
                          : soon
                            ? 'cursor-not-allowed border-border bg-card opacity-60'
                            : pending !== null
                              ? 'cursor-not-allowed border-border bg-card opacity-50'
                              : 'border-border bg-card hover:border-primary hover:shadow-md'
                      }`}
                    >
                      <span className="text-4xl" aria-hidden="true">
                        {lang.flag}
                      </span>
                      <span className="text-lg font-semibold text-foreground">{lang.native}</span>
                      <span className="text-xs text-muted-foreground">
                        {languageName(lang.code, lang.name)}
                      </span>
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
                <div className="mt-3 text-center">
                  <button
                    type="button"
                    data-testid="setup-language-show-all"
                    onClick={() => setShowAllLanguages(true)}
                    className="text-sm font-medium text-primary hover:underline"
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
              className="mb-6 rounded-2xl border border-border bg-card p-5 sm:p-6"
            >
              <div className="mb-5 flex items-start justify-between gap-4">
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
                <div className="grid gap-2 sm:grid-cols-3">
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
                        onClick={() => setLevel(option)}
                        data-testid={`setup-level-${option}`}
                        className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
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
                    onClick={() => setLevel(null)}
                    data-testid="setup-level-unsure"
                    className={`rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                      level === null
                        ? 'border-primary bg-[var(--primary-soft)] text-[var(--primary-text)]'
                        : 'border-border bg-background text-foreground hover:bg-accent'
                    }`}
                  >
                    {tl('notSure')}
                  </button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{t('levelHint')}</p>
              </fieldset>

              <fieldset className="mt-5">
                <legend className="mb-2 text-xs font-semibold text-muted-foreground">
                  {t('interests')}
                </legend>
                <div className="grid gap-2 sm:grid-cols-4">
                  {READING_INTERESTS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={interests.includes(id)}
                      onClick={() => toggleInterest(id)}
                      data-testid={`setup-interest-${id}`}
                      className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
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
            </section>

            <div className="rounded-2xl border border-border bg-card px-5 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{t('ready')}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t('readyHint')}</p>
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleContinue(false)}
                    disabled={!selectedLanguage || pending !== null}
                    data-testid="skip-guided-onboarding"
                  >
                    {t('skip')}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => handleContinue(true)}
                    disabled={!selectedLanguage || pending !== null}
                    data-testid="start-guided-onboarding"
                  >
                    {pending ? t('preparing') : t('start')}
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
