'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import RecommendedForYou from '@/components/RecommendedForYou';
import { getLessonsForCollection, getSetting, setSetting } from '@/lib/data-layer';
import { languageDisplayName } from '@/lib/language-names';
import { LANGUAGES, nativeLanguageFromLocale, type LanguageCode } from '@/lib/languages';
import { CEFR_LEVELS, examLabels, setReadingLevel, type CefrLevel } from '@/lib/reading-level';
import { useActiveLanguage } from '@/utils/hooks';

export const NEW_LANGUAGE_FLAG = 'readfox-new-language';
const INTERESTS = ['news', 'travel', 'science', 'literature'] as const;

/** Set just before the reload that follows adding a language. */
export function flagNewLanguage(code: string): void {
  try {
    sessionStorage.setItem(NEW_LANGUAGE_FLAG, code);
  } catch {
    // no prompt this time
  }
}

function peekFlag(): string | null {
  try {
    return sessionStorage.getItem(NEW_LANGUAGE_FLAG);
  } catch {
    return null;
  }
}

function clearFlag(): void {
  try {
    sessionStorage.removeItem(NEW_LANGUAGE_FLAG);
  } catch {
    // nothing to clear
  }
}

/** A short version of setup for a language added later: level and interests, then a first read. */
export default function NewLanguagePrompt() {
  const t = useTranslations('newLanguage');
  const tl = useTranslations('readingLevel');
  const ts = useTranslations('setup');
  const router = useRouter();
  const locale = useLocale();
  const active = useActiveLanguage();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<'ask' | 'pick'>('ask');
  const [level, setLevel] = useState<CefrLevel | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [native, setNative] = useState(() => nativeLanguageFromLocale(locale));

  useEffect(() => {
    const code = peekFlag();
    if (!code || code !== active.code) return;
    clearFlag();
    let cancelled = false;
    Promise.all([
      getSetting<string>('nativeLanguage').catch(() => undefined),
      getSetting<string[]>('readingInterests').catch(() => undefined),
    ]).then(([savedNative, savedInterests]) => {
      if (cancelled) return;
      if (savedNative) setNative(savedNative);
      setInterests(savedInterests ?? []);
      setOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [active.code]);

  const languageName = languageDisplayName(
    active.code,
    locale,
    LANGUAGES[active.code as LanguageCode]?.name ?? active.name,
  );

  async function submit() {
    await Promise.all([
      level ? setReadingLevel(active.code, level).catch(() => {}) : Promise.resolve(),
      setSetting('readingInterests', interests).catch(() => {}),
    ]);
    setStage('pick');
  }

  async function openCollection(collectionId: string) {
    const lessons = await getLessonsForCollection(collectionId);
    setOpen(false);
    router.push(lessons[0] ? `/read/${lessons[0].id}` : '/');
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <DialogTitle>{t('title', { language: languageName })}</DialogTitle>
          <DialogClose
            className={buttonVariants({ variant: 'ghost', size: 'icon' })}
            aria-label={t('close')}
          >
            <X className="h-5 w-5" />
          </DialogClose>
        </div>
        <div className="overflow-y-auto px-6 py-4" data-testid="new-language-prompt">
          {stage === 'ask' ? (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">
                {t('intro', { language: languageName })}
              </p>
              <fieldset>
                <legend className="mb-2 text-xs font-semibold text-muted-foreground">
                  {ts('level')}
                </legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {CEFR_LEVELS.map((option) => {
                    const exams = examLabels(active.code, option, native, (exam, score) =>
                      tl(`exam.${exam}`, { score }),
                    ).join(' · ');
                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={level === option}
                        onClick={() => setLevel(option)}
                        data-testid={`new-language-level-${option}`}
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
                    className={`rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors ${
                      level === null
                        ? 'border-primary bg-[var(--primary-soft)] text-[var(--primary-text)]'
                        : 'border-border bg-background text-foreground hover:bg-accent'
                    }`}
                  >
                    {tl('notSure')}
                  </button>
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-xs font-semibold text-muted-foreground">
                  {ts('interests')}
                </legend>
                <div className="grid gap-2 sm:grid-cols-4">
                  {INTERESTS.map((id) => {
                    const on = interests.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setInterests((prev) =>
                            on ? prev.filter((x) => x !== id) : [...prev, id],
                          )
                        }
                        className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                          on
                            ? 'border-primary bg-[var(--primary-soft)] text-[var(--primary-text)]'
                            : 'border-border bg-background text-foreground hover:bg-accent'
                        }`}
                      >
                        {ts(`interest.${id}`)}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setOpen(false)}
                  data-testid="new-language-later"
                >
                  {t('later')}
                </Button>
                <Button onClick={() => void submit()} data-testid="new-language-submit">
                  {t('submit')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t('pickIntro')}</p>
              <RecommendedForYou
                language={active.code}
                level={level}
                interests={interests}
                onStart={openCollection}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
