'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getActivePack } from '@/lib/data-layer';
import type { ReviewItem } from '@/types';
import { ChoiceList } from './ChooseMeaning';
import { buildFillInQuestion } from './questions';
import SentenceTranslation from './SentenceTranslation';
import SourceLine from './SourceLine';

export default function FillIn({
  item,
  roundItems,
  locked,
  showTranslation,
  onShowTranslation,
  onAnswer,
}: {
  item: ReviewItem;
  roundItems: ReviewItem[];
  locked: boolean;
  showTranslation: boolean;
  onShowTranslation: () => void;
  onAnswer: (answer: 'right' | 'wrong') => Promise<boolean>;
}) {
  const t = useTranslations('practice.words');
  const question = useMemo(
    () => buildFillInQuestion(item, roundItems, getActivePack()),
    [item, roundItems],
  );
  const [selected, setSelected] = useState<number | null>(null);
  if (!question) return null;

  const select = async (index: number) => {
    setSelected(index);
    const saved = await onAnswer(index === question.correctIndex ? 'right' : 'wrong');
    if (!saved) setSelected(null);
  };

  return (
    <div data-testid="fill-in">
      <p className="mb-2 text-center text-sm text-muted-foreground">{t('fillIn')}</p>
      <p className="mb-2 py-4 text-center text-xl leading-relaxed">{question.blanked}</p>
      {!locked && <SourceLine source={item.sentenceSource} />}
      {item.sentenceTranslation
        ? !locked && (
            <SentenceTranslation
              text={item.sentenceTranslation.text}
              show={showTranslation}
              onShow={onShowTranslation}
            />
          )
        : item.translation && (
            <p className="mb-6 text-center text-sm text-muted-foreground">{item.translation}</p>
          )}
      <ChoiceList
        options={question.options}
        correctIndex={question.correctIndex}
        selected={selected}
        locked={locked}
        target
        onSelect={(index) => void select(index)}
      />
    </div>
  );
}
