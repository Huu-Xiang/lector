'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface DemoWord {
  text: string;
  gloss?: string;
  pos?: string;
  note?: string;
}

interface DemoSample {
  id: 'fr' | 'es' | 'en';
  label: string;
  bookTitle: string;
  tokens: DemoWord[];
  defaultIndex: number;
}

const SAMPLES: readonly DemoSample[] = [
  {
    id: 'fr',
    label: 'Français',
    bookTitle: 'Le Petit Prince',
    defaultIndex: 4,
    tokens: [
      { text: 'On ' },
      { text: 'ne ' },
      { text: 'voit', gloss: 'sees', pos: 'verb', note: 'present tense of voir (to see)' },
      { text: ' ' },
      { text: 'bien', gloss: 'clearly / well', pos: 'adverb', note: 'here: truly, clearly' },
      { text: " qu'" },
      { text: 'avec', gloss: 'with', pos: 'preposition' },
      { text: ' le ' },
      { text: 'cœur', gloss: 'heart', pos: 'noun (m.)', note: 'figurative seat of feeling' },
      { text: '. ' },
      { text: "L'" },
      {
        text: 'essentiel',
        gloss: 'what is essential',
        pos: 'noun (m.)',
        note: 'the most important thing',
      },
      { text: ' est ' },
      { text: 'invisible', gloss: 'invisible', pos: 'adjective' },
      { text: ' pour les ' },
      { text: 'yeux', gloss: 'eyes', pos: 'noun (m. pl.)', note: 'irregular plural of œil' },
      { text: '.' },
    ],
  },
  {
    id: 'es',
    label: 'Español',
    bookTitle: 'Don Quijote',
    defaultIndex: 4,
    tokens: [
      { text: 'En un ' },
      { text: 'lugar', gloss: 'place / village', pos: 'noun (m.)' },
      { text: ' de la Mancha, de cuyo ' },
      { text: 'nombre', gloss: 'name', pos: 'noun (m.)' },
      { text: ' no quiero ' },
      {
        text: 'acordarme',
        gloss: 'to remember',
        pos: 'verb (refl.)',
        note: 'acordarse + me ("remind myself / recall")',
      },
      { text: ', no ha mucho ' },
      { text: 'tiempo', gloss: 'time', pos: 'noun (m.)' },
      { text: ' que ' },
      { text: 'vivía', gloss: 'lived', pos: 'verb', note: 'imperfect of vivir (to live)' },
      { text: ' un ' },
      {
        text: 'hidalgo',
        gloss: 'minor nobleman',
        pos: 'noun (m.)',
        note: 'historical Spanish gentry',
      },
      { text: '.' },
    ],
  },
  {
    id: 'en',
    label: 'English',
    bookTitle: 'Alice in Wonderland',
    defaultIndex: 4,
    tokens: [
      { text: 'Alice was beginning to get very ' },
      { text: 'tired', gloss: 'weary, bored', pos: 'adjective' },
      { text: ' of sitting by her sister on the ' },
      { text: 'bank', gloss: 'riverbank', pos: 'noun', note: 'sloping ground beside a river' },
      { text: ', and once or twice she had ' },
      {
        text: 'peeped',
        gloss: 'glanced quickly',
        pos: 'verb',
        note: 'past tense of peep (look furtively)',
      },
      { text: ' into the book her sister was reading.' },
    ],
  },
];

export default function LandingReaderDemo() {
  const t = useTranslations('landing.demo');
  const [sampleId, setSampleId] = useState<DemoSample['id']>('fr');
  const sample = SAMPLES.find((s) => s.id === sampleId) ?? SAMPLES[0];
  const [selectedIndex, setSelectedIndex] = useState<number>(sample.defaultIndex);

  const activeWord = sample.tokens[selectedIndex]?.gloss
    ? sample.tokens[selectedIndex]
    : sample.tokens.find((w) => w.gloss);

  function switchSample(next: DemoSample) {
    setSampleId(next.id);
    setSelectedIndex(next.defaultIndex);
  }

  return (
    <div
      data-testid="landing-reader-demo"
      className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {t('badge')}
        </span>
        <div className="flex gap-1" role="tablist" aria-label={t('badge')}>
          {SAMPLES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={item.id === sample.id}
              onClick={() => switchSample(item)}
              className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                item.id === sample.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-2 text-xs font-medium text-muted-foreground">{sample.bookTitle}</p>

      <p lang={sample.id} className="font-serif text-lg leading-relaxed text-foreground">
        {sample.tokens.map((tok, idx) =>
          tok.gloss ? (
            <button
              key={idx}
              type="button"
              onClick={() => setSelectedIndex(idx)}
              aria-pressed={idx === selectedIndex}
              className={`inline cursor-pointer rounded px-0.5 transition-colors ${
                idx === selectedIndex
                  ? 'bg-primary/20 font-semibold text-foreground ring-1 ring-primary'
                  : 'bg-[var(--primary-soft)] text-foreground hover:bg-primary/15'
              }`}
            >
              {tok.text}
            </button>
          ) : (
            <span key={idx}>{tok.text}</span>
          ),
        )}
      </p>

      {activeWord && (
        <div
          data-testid="landing-demo-gloss"
          className="mt-4 rounded-xl border border-border bg-background/80 p-3.5"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-serif text-base font-bold text-foreground">
              {activeWord.text}
            </span>
            {activeWord.pos && (
              <span className="text-xs text-muted-foreground">{activeWord.pos}</span>
            )}
          </div>
          <p className="mt-1 text-sm font-medium text-foreground">{activeWord.gloss}</p>
          {activeWord.note && (
            <p className="mt-0.5 text-xs text-muted-foreground">{activeWord.note}</p>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{t('hint')}</span>
        <Link href="/books" className="shrink-0 font-semibold text-primary hover:underline">
          {t('cta')}
        </Link>
      </div>
    </div>
  );
}
