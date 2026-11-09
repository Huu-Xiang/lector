'use client';

import Link from 'next/link';
import { Fragment, useEffect, useRef, useSyncExternalStore, type PointerEvent } from 'react';
import { useTranslations } from 'next-intl';
import { usePhraseTouchSelection } from '@/components/MarkdownReader/usePhraseTouchSelection';
import { DEMO_SETS, isWordToken, SENTENCES, type DemoSetId } from './demo-data';
import { demoSetFor } from './demo-language';
import { stepOfPhase } from './demo-flow';
import DemoPanel, { usePanelText } from './DemoPanel';
import { useDemoRun } from './useDemoRun';

interface Props {
  initialSet: DemoSetId;
  /** The visitor chose an interface language, so the browser languages are not consulted. */
  fromCookie: boolean;
}

const subscribeNever = () => () => {};

function subscribeCoarse(onChange: () => void) {
  const query = window.matchMedia('(pointer: coarse)');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export default function LandingDemo({ initialSet, fromCookie }: Props) {
  const setId = useSyncExternalStore(
    subscribeNever,
    () => (fromCookie ? initialSet : demoSetFor(navigator.languages)),
    () => initialSet,
  );
  return <DemoCard key={setId} setId={setId} />;
}

function DemoCard({ setId }: { setId: DemoSetId }) {
  const t = useTranslations('landing.demo');
  const set = DEMO_SETS[setId];
  const sentences = SENTENCES[set.learn];
  const {
    view,
    reduced,
    cardRef,
    ctxRef,
    registerWord,
    start,
    stop,
    interact,
    pressWord,
    setSelection,
    selectSpan,
  } = useDemoRun(set);
  const sentencesRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ sentence: number; anchor: number; last: number } | null>(null);
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  const coarse = useSyncExternalStore(
    subscribeCoarse,
    () => window.matchMedia('(pointer: coarse)').matches,
    () => false,
  );

  usePhraseTouchSelection(sentencesRef, (first, last) => {
    const sentence = Number(first.dataset.sentence);
    const a = Number(first.dataset.index);
    const b = Number(last.dataset.index);
    selectSpan(sentence, Math.min(a, b), Math.max(a, b));
  });

  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      const current = drag.current;
      if (!current) return;
      const word = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>('[data-word-state]');
      if (!word || Number(word.dataset.sentence) !== current.sentence) return;
      const index = Number(word.dataset.index);
      if (index === current.last) return;
      current.last = index;
      setSelection(
        index === current.anchor
          ? null
          : {
              sentence: current.sentence,
              from: Math.min(index, current.anchor),
              to: Math.max(index, current.anchor),
            },
      );
    };
    const up = () => {
      const current = drag.current;
      drag.current = null;
      if (!current || current.last === current.anchor) return;
      selectSpan(
        current.sentence,
        Math.min(current.last, current.anchor),
        Math.max(current.last, current.anchor),
      );
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [selectSpan, setSelection]);

  const onWordPointerDown = (event: PointerEvent, sentence: number, index: number) => {
    pressWord(sentence, index, event.pointerType);
    if (event.pointerType === 'touch' || event.button !== 0) return;
    drag.current = { sentence, anchor: index, last: index };
  };

  const step = stepOfPhase(view.phase);
  const prompting = step !== null && !view.acting;
  const running = view.phase === 'auto' || step !== null;
  const dragPrompt = coarse ? t('stepDragCoarse') : t('stepDragFine');
  const prompt =
    prompting && step === 'word'
      ? t('stepWord')
      : prompting && step === 'context'
        ? t('stepContext')
        : prompting && step === 'sentence'
          ? dragPrompt
          : view.phase === 'done'
            ? t('done')
            : '';
  const announcement = usePanelText(set, view.panel);

  return (
    <section
      ref={cardRef}
      aria-label={t('label')}
      data-testid="landing-demo"
      data-set={setId}
      data-phase={view.phase}
      className="relative mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <div ref={sentencesRef} className="select-none">
        {sentences.map((sentence, si) => (
          <p
            key={si}
            lang={sentence.lang}
            data-testid="demo-sentence"
            className={`mb-3 rounded-md font-reading text-lg leading-relaxed text-foreground ${
              step === 'sentence' && !view.acting && si === 1 ? 'demo-wash' : ''
            }`}
          >
            {sentence.tokens.map((token, i) => {
              const space = i > 0 && isWordToken(token) ? ' ' : '';
              if (!isWordToken(token)) return token;
              const isHit = view.hit?.sentence === si && view.hit.index === i;
              const isTarget = si === 1 && i === sentence.demoIndex;
              const pulsing = isTarget && step === 'word' && !view.acting;
              const selected =
                view.selection?.sentence === si &&
                i >= view.selection.from &&
                i <= view.selection.to;
              return (
                <Fragment key={i}>
                  {space}
                  <button
                    type="button"
                    ref={registerWord(si, i)}
                    data-word-state="demo"
                    data-sentence={si}
                    data-index={i}
                    data-testid="demo-word"
                    data-selected={selected ? '' : undefined}
                    onPointerDown={(event) => onWordPointerDown(event, si, i)}
                    onClick={() => interact({ kind: 'word', sentence: si, index: i })}
                    className={`-mx-0.5 cursor-pointer rounded px-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                      isHit || pulsing
                        ? 'bg-[var(--primary-soft)] text-[var(--primary-text)]'
                        : selected
                          ? 'bg-[color-mix(in_srgb,var(--clay)_22%,transparent)]'
                          : 'hover:bg-[color-mix(in_srgb,var(--clay)_12%,transparent)]'
                    } ${pulsing ? 'demo-pulse' : ''}`}
                  >
                    {token}
                  </button>
                </Fragment>
              );
            })}
          </p>
        ))}
      </div>

      <p
        data-testid="demo-prompt"
        className="min-h-[2.75rem] text-sm leading-snug font-semibold text-[var(--primary-text)]"
      >
        {prompt}
      </p>

      <DemoPanel
        set={set}
        panel={view.panel}
        hint={coarse ? t('hintCoarse') : t('hintFine')}
        ctxRef={ctxRef}
        pulseContext={step === 'context' && !view.acting}
        onContext={() => interact({ kind: 'context' })}
      />

      <div className="mt-3 flex min-h-9 items-center justify-between gap-3">
        <button
          type="button"
          onClick={running ? stop : start}
          data-testid="demo-control"
          className={`rounded-md px-1 text-xs font-semibold text-[var(--primary-text)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
            mounted && !reduced ? '' : 'invisible'
          }`}
        >
          {running ? t('pause') : t('replay')}
        </button>
        {view.phase === 'done' && (
          <Link
            href="/register"
            data-testid="demo-start-free"
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            {t('startFree')}
          </Link>
        )}
      </div>

      <div role="status" aria-live="polite" className="sr-only" data-testid="demo-status">
        {view.byVisitor ? announcement : ''}
      </div>

      <span
        aria-hidden="true"
        data-testid="demo-cursor"
        className="demo-cursor pointer-events-none absolute top-0 left-0 z-10"
        style={{
          transform: `translate(${view.cursor.x}px, ${view.cursor.y}px)`,
          opacity: view.cursor.visible ? 1 : 0,
          transition: `transform ${view.cursor.ms}ms ${view.cursor.ms > 300 ? 'cubic-bezier(.3,.7,.3,1)' : 'linear'}, opacity 200ms`,
        }}
      >
        {coarse ? (
          <span
            className={`-mt-3 -ml-3 block size-6 rounded-full border-2 border-foreground/60 bg-foreground/20 transition-transform ${
              view.cursor.pressed ? 'scale-75' : ''
            }`}
          />
        ) : (
          <svg
            viewBox="0 0 18 22"
            className={`h-[22px] w-[18px] drop-shadow transition-transform ${view.cursor.pressed ? 'scale-80' : ''}`}
          >
            <path
              d="M1 1l0 17 5-4 3 7 3-1-3-7 7 0z"
              fill="var(--card)"
              stroke="var(--foreground)"
              strokeWidth="1.2"
            />
          </svg>
        )}
      </span>
    </section>
  );
}
