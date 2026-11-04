'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { getActivePack } from '@/lib/data-layer';
import type { ReviewItem } from '@/types';
import { useQuestionKeys } from './use-question-keys';
import WordHeader from './WordHeader';

export function ChoiceList({
  options,
  correctIndex,
  selected,
  locked,
  target,
  onSelect,
}: {
  options: string[];
  correctIndex: number;
  selected: number | null;
  locked: boolean;
  target: boolean;
  onSelect: (index: number) => void;
}) {
  const pack = getActivePack();
  useQuestionKeys(
    (event) => {
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < options.length) {
        event.preventDefault();
        onSelect(index);
      }
    },
    !locked && selected === null,
  );

  return (
    <div className="grid gap-3">
      {options.map((option, index) => {
        let tone = 'border-border bg-card text-foreground hover:bg-accent';
        if (selected !== null) {
          if (index === correctIndex) {
            tone =
              'border-primary bg-[color-mix(in_srgb,var(--primary)_14%,var(--card))] text-primary';
          } else if (index === selected) {
            tone =
              'border-destructive bg-[color-mix(in_srgb,var(--destructive)_12%,var(--card))] text-destructive';
          } else {
            tone = 'border-border bg-card text-muted-foreground opacity-60';
          }
        }
        return (
          <button
            key={index}
            type="button"
            data-testid="word-choice"
            disabled={locked || selected !== null}
            onClick={() => onSelect(index)}
            className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-base font-medium transition-all active:scale-[0.98] ${tone}`}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground">
              {index + 1}
            </span>
            {target ? (
              <bdi dir={pack.script.direction} lang={pack.script.bcp47}>
                {option}
              </bdi>
            ) : (
              <span>{option}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function ChooseMeaning({
  item,
  locked,
  onAnswer,
}: {
  item: ReviewItem;
  locked: boolean;
  onAnswer: (answer: 'right' | 'wrong') => Promise<boolean>;
}) {
  const t = useTranslations('practice.words');
  const options = item.choices ?? [];
  const correctIndex = options.indexOf(item.translation);
  const [selected, setSelected] = useState<number | null>(null);

  const select = async (index: number) => {
    setSelected(index);
    const saved = await onAnswer(index === correctIndex ? 'right' : 'wrong');
    if (!saved) setSelected(null);
  };

  return (
    <div data-testid="choose-meaning">
      <WordHeader word={item.word} />
      <p className="mb-4 text-center text-sm text-muted-foreground">{t('chooseMeaning')}</p>
      <ChoiceList
        options={options}
        correctIndex={correctIndex}
        selected={selected}
        locked={locked}
        target={false}
        onSelect={(index) => void select(index)}
      />
    </div>
  );
}
