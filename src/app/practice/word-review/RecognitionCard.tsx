'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import type { RecognitionAnswer, ReviewItem } from '@/types';
import { recognitionKeyAction } from './questions';
import { useQuestionKeys } from './use-question-keys';
import SentenceTranslation from './SentenceTranslation';
import SourceLine from './SourceLine';
import WordHeader from './WordHeader';

const ANSWERS: { answer: RecognitionAnswer; key: string; label: 'dontKnow' | 'fuzzy' | 'know' }[] =
  [
    { answer: 'dont_know', key: '1', label: 'dontKnow' },
    { answer: 'fuzzy', key: '2', label: 'fuzzy' },
    { answer: 'know', key: '3', label: 'know' },
  ];

export default function RecognitionCard({
  item,
  locked,
  showTranslation,
  onShowTranslation,
  onAnswer,
}: {
  item: ReviewItem;
  locked: boolean;
  showTranslation: boolean;
  onShowTranslation: () => void;
  onAnswer: (answer: RecognitionAnswer) => Promise<boolean>;
}) {
  const t = useTranslations('practice.words.recognition');
  const [revealed, setRevealed] = useState(false);
  const example = item.example;

  useQuestionKeys((event) => {
    const action = recognitionKeyAction(event.key, revealed);
    if (!action) return;
    event.preventDefault();
    if (action === 'reveal') setRevealed(true);
    else void onAnswer(action);
  }, !locked);

  return (
    <div data-testid="recognition-card">
      <WordHeader word={item.word} />
      {!revealed ? (
        <div className="flex flex-col items-center gap-3 py-4">
          <Button variant="secondary" onClick={() => setRevealed(true)} disabled={locked}>
            {t('reveal')}
          </Button>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Kbd>Space</Kbd>
          </span>
        </div>
      ) : (
        <div>
          <p className="text-center text-lg text-foreground" data-testid="recognition-meaning">
            {item.translation}
          </p>
          {example ? (
            <div className="mt-3" data-testid="recognition-example">
              <p className="mb-1 text-center text-sm text-muted-foreground">{example.text}</p>
              <SourceLine source={example.source} className="mb-1 text-center" />
              <SentenceTranslation
                text={example.translation?.text}
                show={showTranslation}
                onShow={onShowTranslation}
                className="text-center"
              />
            </div>
          ) : (
            item.sentence && (
              <p className="mt-3 text-center text-sm text-muted-foreground">{item.sentence}</p>
            )
          )}
          <div className="mt-6 grid grid-cols-3 gap-2">
            {ANSWERS.map(({ answer, key, label }) => (
              <Button
                key={answer}
                variant={answer === 'know' ? 'default' : 'secondary'}
                disabled={locked}
                onClick={() => void onAnswer(answer)}
                data-testid={`answer-${answer}`}
              >
                {t(label)}
                <Kbd>{key}</Kbd>
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
