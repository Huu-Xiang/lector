'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getActivePack } from '@/lib/data-layer';
import { isComposing } from '@/lib/keyboard';
import type { ReviewItem } from '@/types';
import { checkAnswer } from '../utils';
import { blankSentence } from './questions';

export default function TypedFillIn({
  item,
  locked,
  onAnswer,
}: {
  item: ReviewItem;
  locked: boolean;
  onAnswer: (answer: 'right' | 'wrong') => Promise<boolean>;
}) {
  const t = useTranslations('practice.words');
  const pack = getActivePack();
  const blanked = blankSentence(item, pack);
  const [typed, setTyped] = useState('');
  const [submitted, setSubmitted] = useState(false);
  if (blanked === null) return null;

  const submit = async (answer: 'right' | 'wrong') => {
    setSubmitted(true);
    const saved = await onAnswer(answer);
    if (!saved) setSubmitted(false);
  };

  const disabled = locked || submitted;

  return (
    <div data-testid="typed-fill-in">
      <p className="mb-2 text-center text-sm text-muted-foreground">{t('typedFillIn')}</p>
      <p className="mb-2 py-4 text-center text-xl leading-relaxed">{blanked}</p>
      {item.translation && (
        <p className="mb-6 text-center text-sm text-muted-foreground">{item.translation}</p>
      )}
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled || !typed.trim()) return;
          void submit(checkAnswer(typed, item.word, pack) ? 'right' : 'wrong');
        }}
        onKeyDown={(event) => {
          if (isComposing(event.nativeEvent) && event.key === 'Enter') event.preventDefault();
        }}
      >
        <Input
          autoFocus
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          disabled={disabled}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label={t('typedPlaceholder')}
          placeholder={t('typedPlaceholder')}
          data-testid="typed-input"
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={disabled || !typed.trim()} className="flex-1">
            {t('check')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            onClick={() => void submit('wrong')}
          >
            {t('showAnswer')}
          </Button>
        </div>
      </form>
    </div>
  );
}
