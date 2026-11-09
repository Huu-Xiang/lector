'use client';

import type { Ref } from 'react';
import { useTranslations } from 'next-intl';
import {
  lookupWord,
  phraseTranslation,
  SENTENCES,
  type DemoSentence,
  type DemoSet,
} from './demo-data';
import type { PanelView } from './useDemoRun';

export function usePanelText(set: DemoSet, panel: PanelView): string {
  const t = useTranslations('landing.demo');
  const sentences = SENTENCES[set.learn];
  if (panel.kind === 'word') {
    const entry = lookupWord(set, sentences[panel.sentence].tokens[panel.index]);
    if (!entry) return '';
    const parts = [entry.head, entry.pos, entry.meaning];
    if (panel.ctxChars !== null) {
      parts.push(`${t('inContext')}: ${set.sentences[panel.sentence].context}`);
    }
    return parts.join('. ');
  }
  if (panel.kind === 'phrase') {
    const { text, translation } = phraseTranslation(set, panel.sentence, panel.from, panel.to);
    return `${text}. ${translation}`;
  }
  if (panel.kind === 'sentence') {
    const { translation, note } = set.sentences[panel.sentence];
    return `${translation} ${t(note.kind)}: ${note.text}`;
  }
  return '';
}

interface Props {
  set: DemoSet;
  panel: PanelView;
  hint: string;
  ctxRef: Ref<HTMLButtonElement>;
  pulseContext: boolean;
  onContext: () => void;
}

export default function DemoPanel({ set, panel, hint, ctxRef, pulseContext, onContext }: Props) {
  const t = useTranslations('landing.demo');
  const sentences = SENTENCES[set.learn];
  return (
    <div
      role="group"
      aria-label={t('panelLabel')}
      data-testid="demo-panel"
      className="h-[12.5rem] overflow-hidden rounded-xl border border-border bg-background p-3 text-sm text-foreground lg:h-[11rem]"
    >
      {panel.kind === 'empty' && <p className="text-muted-foreground">{hint}</p>}
      {panel.kind === 'word' && (
        <WordBody
          set={set}
          panel={panel}
          sentences={sentences}
          ctxRef={ctxRef}
          pulse={pulseContext}
          onContext={onContext}
        />
      )}
      {panel.kind === 'phrase' && (
        <PhraseBody set={set} panel={panel} sentence={sentences[panel.sentence]} />
      )}
      {panel.kind === 'sentence' && (
        <div>
          <p lang={set.meaningLang} className="text-[0.9375rem] leading-snug">
            {set.sentences[panel.sentence].translation}
          </p>
          <p className="mt-2 leading-snug">
            <span className="block text-[0.6875rem] font-semibold text-[var(--primary-text)]">
              {t(set.sentences[panel.sentence].note.kind)}
            </span>
            <span lang={set.meaningLang}>{set.sentences[panel.sentence].note.text}</span>
          </p>
        </div>
      )}
    </div>
  );
}

function PhraseBody({
  set,
  panel,
  sentence,
}: {
  set: DemoSet;
  panel: Extract<PanelView, { kind: 'phrase' }>;
  sentence: DemoSentence;
}) {
  const { text, translation } = phraseTranslation(set, panel.sentence, panel.from, panel.to);
  return (
    <div>
      <span lang={sentence.lang} className="block text-base leading-snug font-semibold">
        {text}
      </span>
      <p lang={set.meaningLang} className="mt-0.5 text-[0.9375rem] leading-snug">
        {translation}
      </p>
    </div>
  );
}

function WordBody({
  set,
  panel,
  sentences,
  ctxRef,
  pulse,
  onContext,
}: {
  set: DemoSet;
  panel: Extract<PanelView, { kind: 'word' }>;
  sentences: readonly [DemoSentence, DemoSentence];
  ctxRef: Ref<HTMLButtonElement>;
  pulse: boolean;
  onContext: () => void;
}) {
  const t = useTranslations('landing.demo');
  const sentence = sentences[panel.sentence];
  const entry = lookupWord(set, sentence.tokens[panel.index]);
  if (!entry) return null;
  const hasContext = panel.index === sentence.demoIndex;
  const context = set.sentences[panel.sentence].context;
  const shown =
    panel.ctxChars === null ? '' : Array.from(context).slice(0, panel.ctxChars).join('');
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span lang={sentence.lang} className="text-base font-semibold">
          {entry.head}
        </span>
        <span className="text-muted-foreground">{entry.ipa}</span>
        <span lang={set.meaningLang} className="text-xs text-muted-foreground">
          {entry.pos}
        </span>
      </div>
      <p lang={set.meaningLang} className="mt-0.5 leading-snug">
        {entry.meaning}
      </p>
      {hasContext && (
        <button
          ref={ctxRef}
          type="button"
          aria-expanded={panel.ctxChars !== null}
          data-testid="demo-context"
          onClick={onContext}
          className={`mt-2 rounded-full border px-3 py-0.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
            panel.ctxChars !== null
              ? 'border-transparent bg-[var(--primary-soft)] text-[var(--primary-text)]'
              : 'border-border text-muted-foreground hover:bg-accent'
          } ${pulse ? 'demo-pulse border-primary text-[var(--primary-text)]' : ''}`}
        >
          {t('inContext')}
        </button>
      )}
      {hasContext && panel.ctxChars !== null && (
        <p className="mt-1.5 leading-snug" lang={set.meaningLang} data-testid="demo-context-text">
          {shown}
        </p>
      )}
    </div>
  );
}
