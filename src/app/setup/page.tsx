'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { getSetting, seedStarterContent, setSetting } from '@/lib/data-layer';
import { LANGUAGES, nativeLanguageFromLocale, type LanguageCode } from '@/lib/languages';
import {
  getOnboardingSnapshot,
  skipOnboarding,
  startOnboarding,
  type ApproximateLevel,
  type LearnerInterest,
} from '@/lib/onboarding';
import { setLanguageInStorage } from '@/utils/storage';
import { Button } from '@/components/ui/button';

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
const POPULAR_LANGUAGES: LanguageCode[] = ['es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh', 'ru'];

const levelOptions: ApproximateLevel[] = [
  'new',
  'beginner',
  'intermediate',
  'advanced',
  'not_sure',
];

const interestOptions: LearnerInterest[] = [
  'everyday-life',
  'culture',
  'current-events',
  'literature',
  'faith-and-theology',
  'travel',
];

export default function SetupPage() {
  const t = useTranslations('setup');
  const locale = useLocale();
  const router = useRouter();
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode | null>(null);
  const [pending, setPending] = useState<LanguageCode | null>(null);
  const [level, setLevel] = useState<ApproximateLevel>('not_sure');
  const [interests, setInterests] = useState<LearnerInterest[]>([]);
  const [dailyMinutes, setDailyMinutes] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [showAllLanguages, setShowAllLanguages] = useState(false);
  const displayNames = new Intl.DisplayNames([locale], { type: 'language' });
  const languageName = (code: string, fallback: string) => {
    try {
      return displayNames.of(code) ?? fallback;
    } catch {
      return fallback;
    }
  };

  // A completed/skipped guide never reappears. An explicit visit while a guide
  // is in progress resumes its real starter lesson instead of beginning again.
  useEffect(() => {
    let cancelled = false;
    void getOnboardingSnapshot()
      .then((snapshot) => {
        if (cancelled || !snapshot.progress) return;
        if (snapshot.profile) {
          setLevel(snapshot.profile.approximateLevel);
          setInterests(snapshot.profile.interests);
          setDailyMinutes(snapshot.profile.dailyMinutes);
        }
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
  }, [router]);

  function toggleInterest(interest: LearnerInterest) {
    setInterests((current) =>
      current.includes(interest)
        ? current.filter((value) => value !== interest)
        : [...current, interest],
    );
  }

  async function handleContinue(guided: boolean) {
    if (!selectedLanguage || pending) return;
    const code = selectedLanguage;
    setPending(selectedLanguage);
    setError(null);

    try {
      // First setup: take the browser language as the learner's own language.
      // Best effort; the Settings card lets them change it.
      try {
        if (!(await getSetting<string>('nativeLanguage'))) {
          await setSetting('nativeLanguage', nativeLanguageFromLocale(navigator.language));
        }
      } catch {}

      // Seeding is safe before the target-language write: the route accepts an
      // explicit language and is idempotent. /onboarding/start or /skip then
      // atomically persists the profile, progress and target language.
      const starter = await seedStarterContent(code);
      const profile = {
        language: code,
        approximateLevel: level,
        interests,
        dailyMinutes,
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

      // Languages without a starter series take the normal library path. This
      // is recorded as skipped rather than leaving an impossible in-progress
      // guide with no lesson to resume.
      await skipOnboarding(profile);
      setLanguageInStorage(code);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errSave'));
      setPending(null);
    }
  }

  const expanded =
    showAllLanguages ||
    (selectedLanguage !== null && !POPULAR_LANGUAGES.includes(selectedLanguage));
  const visibleLanguageCards = expanded
    ? languageCards
    : languageCards.filter((lang) => POPULAR_LANGUAGES.includes(lang.code));
  const hiddenLanguageCount = languageCards.length - visibleLanguageCards.length;

  return (
    <main className="min-h-screen bg-background px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[var(--primary-soft)] px-3 py-1 text-sm font-semibold text-[var(--primary-text)]">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {t('badge')}
          </div>
          <h1 className="mb-3 text-3xl font-bold tracking-tight text-foreground">{t('welcome')}</h1>
          <p className="mx-auto max-w-xl text-base text-muted-foreground sm:text-lg">
            {t('intro')}
          </p>
        </div>

        <section aria-labelledby="language-heading" className="mb-8">
          <h2 id="language-heading" className="mb-3 text-sm font-bold text-foreground">
            {t('chooseLanguage')}
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {visibleLanguageCards.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => setSelectedLanguage(lang.code)}
                disabled={pending !== null}
                data-testid={`setup-language-${lang.code}`}
                aria-label={t('learn', { name: languageName(lang.code, lang.name) })}
                aria-pressed={selectedLanguage === lang.code}
                className={`group flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border-2 px-4 py-5 transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none ${
                  selectedLanguage === lang.code
                    ? 'border-primary bg-[var(--primary-soft)]'
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
              </button>
            ))}
          </div>
          {hiddenLanguageCount > 0 && (
            <div className="mt-3 text-center">
              <button
                type="button"
                data-testid="setup-language-show-all"
                onClick={() => setShowAllLanguages(true)}
                className="text-sm font-medium text-primary hover:underline"
              >
                {t('showMore', { count: hiddenLanguageCount })}
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

          <fieldset className="mb-5">
            <legend className="mb-2 text-xs font-semibold text-muted-foreground">
              {t('level')}
            </legend>
            <div className="flex flex-wrap gap-2">
              {levelOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={level === option}
                  onClick={() => setLevel(option)}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                    level === option
                      ? 'border-primary bg-[var(--primary-soft)] text-[var(--primary-text)]'
                      : 'border-border bg-background text-foreground hover:bg-accent'
                  }`}
                >
                  {t(`levels.${option}`)}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="mb-5">
            <legend className="mb-2 text-xs font-semibold text-muted-foreground">
              {t('interests')}
            </legend>
            <div className="flex flex-wrap gap-2">
              {interestOptions.map((option) => {
                const selected = interests.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleInterest(option)}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                      selected
                        ? 'border-primary bg-[var(--primary-soft)] text-[var(--primary-text)]'
                        : 'border-border bg-background text-foreground hover:bg-accent'
                    }`}
                  >
                    {selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                    {t(`interestOptions.${option}`)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-xs font-semibold text-muted-foreground">
              {t('dailyTime')}
            </legend>
            <div className="flex flex-wrap gap-2">
              {[5, 10, 20, 30].map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  aria-pressed={dailyMinutes === minutes}
                  onClick={() => setDailyMinutes(minutes)}
                  className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                    dailyMinutes === minutes
                      ? 'border-primary bg-[var(--primary-soft)] text-[var(--primary-text)]'
                      : 'border-border bg-background text-foreground hover:bg-accent'
                  }`}
                >
                  {t('minutes', { minutes })}
                </button>
              ))}
            </div>
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
      </div>
    </main>
  );
}
