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
import ClickableReviewSentence from './ClickableReviewSentence';
import PhraseDetailsCard from './PhraseDetailsCard';

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
  onWordClick,
}: {
  item: ReviewItem;
  locked: boolean;
  showTranslation: boolean;
  onShowTranslation: () => void;
  onAnswer: (answer: RecognitionAnswer) => Promise<boolean>;
  onWordClick?: (word: string, contextSentence: string, displaySentence: string) => void;
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
          <PhraseDetailsCard details={item.phraseDetails} className="mt-3" />
          {example ? (
            <div className="mt-3" data-testid="recognition-example">
              <ClickableReviewSentence
                text={example.text}
                contextSentence={example.text}
                onWordClick={onWordClick}
                className="mb-1 text-center text-sm text-muted-foreground"
              />
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
              <ClickableReviewSentence
                text={item.sentence}
                contextSentence={item.sentence}
                onWordClick={onWordClick}
                className="mt-3 text-center text-sm text-muted-foreground"
              />
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
                className="h-auto min-h-11 px-2 py-2 text-center leading-tight whitespace-normal"
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
