'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { IOnboardingCoachProps } from './types';
import { getContent } from './utils';

export default function OnboardingCoach({
  stage,
  savedCount,
  savedWords,
  onStartPractice,
  onSkip,
}: IOnboardingCoachProps) {
  const t = useTranslations('reader.coach');
  const content = getContent({
    stage,
    savedCount,
    t,
  });
  const Icon = content.icon;

  return (
    <aside
      aria-label={t('ariaLabel')}
      aria-live="polite"
      data-testid={`onboarding-coach-${stage}`}
      className="fixed right-3 bottom-20 left-3 z-40 rounded-2xl border border-[var(--gold-lip)] bg-card/95 p-4 shadow-xl backdrop-blur-sm sm:right-auto sm:bottom-5 sm:left-[15rem] sm:w-[25rem]"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--gold-soft)] text-[var(--gold-strong)]">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-bold tracking-wide text-[var(--gold-strong)] uppercase">
              {content.eyebrow}
            </p>
            <button
              type="button"
              onClick={onSkip}
              data-testid="onboarding-coach-skip"
              className="-mt-1 -mr-1 shrink-0 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {t('skip')}
            </button>
          </div>
          <h2 className="mt-0.5 text-base font-bold text-foreground">{content.title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{content.body}</p>
          {(stage === 'save' || stage === 'phrase') && (
            <div className="mt-3" data-testid="onboarding-word-progress">
              <div
                className="grid grid-cols-3 gap-2"
                role="progressbar"
                aria-label={t('progressLabel', { count: Math.min(savedCount, 3) })}
                aria-valuemin={0}
                aria-valuemax={3}
                aria-valuenow={Math.min(savedCount, 3)}
              >
                {[0, 1, 2].map((index) => {
                  const savedWord = savedWords[index];
                  return (
                    <div
                      key={index}
                      className={`flex min-w-0 items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-all duration-300 ${
                        savedWord
                          ? 'border-primary/40 bg-[var(--primary-soft)] text-primary'
                          : 'border-border bg-muted/50 text-muted-foreground'
                      }`}
                    >
                      {savedWord ? (
                        <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      ) : null}
                      <span className="truncate">
                        {savedWord || t('wordPlaceholder', { n: index + 1 })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {stage === 'practice' && onStartPractice && (
            <Button
              type="button"
              size="sm"
              onClick={onStartPractice}
              className="mt-3"
              data-testid="start-onboarding-practice"
            >
              {t('startPractice')}
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}
