'use client';

import { useState } from 'react';
import { Sparkles, Check, BookOpen } from 'lucide-react';
import type { PreviewWordEntry } from '@/lib/tools';

interface Props {
  heading: string;
  hint: string;
  passage: string;
  words: PreviewWordEntry[];
  plainDictLabel: string;
  inContextLabel: string;
  savedCardHint: string;
}

export default function InteractiveContextPreview({
  heading,
  hint,
  passage,
  words,
  plainDictLabel,
  inContextLabel,
  savedCardHint,
}: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const active = words[selectedIdx] ?? words[0];

  // Split passage around target phrases cleanly so every highlighted entry is an interactive button.
  const segments: Array<{ text: string; wordIdx: number | null }> = [];
  let cursor = 0;
  const lowerPassage = passage.toLowerCase();

  while (cursor < passage.length) {
    let bestPos = -1;
    let bestIdx = -1;
    let bestLen = 0;
    for (let i = 0; i < words.length; i += 1) {
      const target = words[i].word.toLowerCase();
      const pos = lowerPassage.indexOf(target, cursor);
      if (pos !== -1 && (bestPos === -1 || pos < bestPos)) {
        bestPos = pos;
        bestIdx = i;
        bestLen = words[i].word.length;
      }
    }
    if (bestPos === -1) {
      segments.push({ text: passage.slice(cursor), wordIdx: null });
      break;
    }
    if (bestPos > cursor) {
      segments.push({ text: passage.slice(cursor, bestPos), wordIdx: null });
    }
    segments.push({ text: passage.slice(bestPos, bestPos + bestLen), wordIdx: bestIdx });
    cursor = bestPos + bestLen;
  }

  return (
    <section
      className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
      data-testid="interactive-context-preview"
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-primary uppercase">
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          <span>{heading}</span>
        </div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>

      <p className="rounded-xl border border-border bg-muted/50 px-4 py-4 font-serif text-lg leading-relaxed text-foreground sm:text-xl">
        {segments.map((seg, idx) => {
          if (seg.wordIdx === null) {
            return <span key={idx}>{seg.text}</span>;
          }
          const isSelected = seg.wordIdx === selectedIdx;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setSelectedIdx(seg.wordIdx!)}
              aria-pressed={isSelected}
              className={`mx-0.5 inline rounded-md border px-1.5 py-0.5 font-semibold transition-colors ${
                isSelected
                  ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                  : 'border-[var(--w-l1-bd)] bg-[var(--w-l1-bg)] text-[var(--w-l1-fg)] hover:brightness-95'
              }`}
              data-testid={`preview-word-${seg.wordIdx}`}
            >
              {seg.text}
            </button>
          );
        })}
      </p>

      {active && (
        <div className="grid gap-3 sm:grid-cols-2" data-testid="preview-word-drawer">
          <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4">
            <div className="mb-1.5 text-xs font-semibold text-destructive">{plainDictLabel}</div>
            <div className="font-serif text-base font-bold text-foreground">
              {active.word}{' '}
              <span className="font-sans text-xs font-normal text-muted-foreground">
                {active.phonetic}
              </span>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground line-through decoration-destructive/60">
              {active.dictionaryMeaning}
            </p>
          </div>

          <div className="rounded-xl border border-primary/40 bg-[var(--primary-soft)]/50 p-4">
            <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{inContextLabel}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="rounded bg-card px-1.5 py-0.5 font-serif text-xs font-semibold italic text-primary">
                {active.pos}
              </span>
              <span className="text-base font-bold text-foreground">{active.contextMeaning}</span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">
              {active.contextExplanation}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span>{savedCardHint}</span>
      </div>
    </section>
  );
}
