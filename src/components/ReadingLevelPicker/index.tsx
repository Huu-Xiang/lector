'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CEFR_LEVELS, type CefrLevel } from '@/lib/reading-level';

/** A1 to C2 as a row of toggle buttons; the chosen level is pressed. */
export default function ReadingLevelPicker({
  level,
  onPick,
  disabled = false,
  label,
  testIdPrefix,
}: {
  level: CefrLevel | null;
  onPick: (level: CefrLevel) => void;
  disabled?: boolean;
  label: string;
  testIdPrefix: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {CEFR_LEVELS.map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          aria-pressed={level === option}
          onClick={() => onPick(option)}
          data-testid={`${testIdPrefix}-${option}`}
          className={cn(
            'min-h-11 min-w-11 rounded-lg border px-3 text-sm font-medium transition-colors disabled:opacity-60 sm:min-h-9',
            level === option
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-card hover:bg-accent',
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/** Link to the English vocabulary test; `from` tells the result page where the learner came from. */
export function VocabTestLink({
  from,
  className,
  testId,
}: {
  from: 'library' | 'settings' | 'nav';
  className?: string;
  testId: string;
}) {
  const t = useTranslations('vocabTest');
  return (
    <Link
      href={`/vocab-test?from=${from}`}
      data-testid={testId}
      className={cn(
        'inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline',
        className,
      )}
    >
      <Gauge className="size-4" aria-hidden="true" />
      {t('takeTest')}
    </Link>
  );
}
