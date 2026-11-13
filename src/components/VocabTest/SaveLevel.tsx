'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getReadingLevel, setReadingLevel, type CefrLevel } from '@/lib/reading-level';

/** For a signed-in learner: make the test level their English reading level, which book picks follow. */
export default function SaveLevel({ level }: { level: CefrLevel }) {
  const t = useTranslations('vocabTest');
  const [current, setCurrent] = useState<CefrLevel | null | undefined>(undefined);
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');

  useEffect(() => {
    let cancelled = false;
    void getReadingLevel('en').then((saved) => {
      if (!cancelled) setCurrent(saved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setState('saving');
    try {
      await setReadingLevel('en', level);
      setCurrent(level);
      setState('idle');
    } catch {
      setState('error');
    }
  }

  if (current === undefined) return null;
  const saved = current === level;

  return (
    <div className="space-y-1 border-b border-border pb-2" data-testid="vocab-save-level">
      <p className="text-sm text-muted-foreground" data-testid="vocab-current-level">
        {current ? t('currentLevel', { level: current }) : t('noLevelYet')}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {saved ? (
          <p className="flex items-center gap-1.5 font-medium" data-testid="vocab-level-saved">
            <Check className="size-5 text-answer-icon-right" aria-hidden="true" />
            {t('levelSaved', { level })}
          </p>
        ) : (
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => void save()}
            disabled={state === 'saving'}
            data-testid="vocab-save-level-button"
          >
            {t('saveLevel', { level })}
          </Button>
        )}
        <Link
          href="/"
          data-testid="vocab-back-library"
          className={cn(buttonVariants({ variant: 'link' }), 'min-h-11')}
        >
          {t('backToLibrary')}
        </Link>
      </div>
      {state === 'error' && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {t('saveLevelFailed')}
        </p>
      )}
    </div>
  );
}
