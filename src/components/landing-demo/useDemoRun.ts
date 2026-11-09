'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { resolveSpan, SENTENCES, type DemoSet } from './demo-data';
import {
  judge,
  judgePress,
  Run,
  RunCancelled,
  stepOfPhase,
  TIMING,
  type DemoTarget,
  type Interaction,
  type Phase,
  type Step,
} from './demo-flow';

export type PanelView =
  | { kind: 'empty' }
  | { kind: 'word'; sentence: number; index: number; ctxChars: number | null }
  | { kind: 'sentence'; sentence: number }
  | { kind: 'phrase'; sentence: number; from: number; to: number };

export interface Selection {
  sentence: number;
  from: number;
  to: number;
}

export interface CursorView {
  x: number;
  y: number;
  visible: boolean;
  pressed: boolean;
  ms: number;
}

export interface DemoView {
  phase: Phase;
  /** The cursor is doing the current step, so its prompt and pulse are off. */
  acting: boolean;
  panel: PanelView;
  hit: DemoTarget | null;
  selection: Selection | null;
  cursor: CursorView;
  /** The panel shows the visitor's own action, which a screen reader announces. */
  byVisitor: boolean;
}

const HIDDEN_CURSOR: CursorView = { x: 0, y: 0, visible: false, pressed: false, ms: 0 };

const INITIAL: DemoView = {
  phase: 'free',
  acting: false,
  panel: { kind: 'empty' },
  hit: null,
  selection: null,
  cursor: HIDDEN_CURSOR,
  byVisitor: false,
};

function subscribeReduced(onChange: () => void) {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function usePrefersReduced(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
}

export function useDemoRun(set: DemoSet) {
  const sentences = SENTENCES[set.learn];
  const targets: [DemoTarget, DemoTarget] = [
    { sentence: 0, index: sentences[0].demoIndex },
    { sentence: 1, index: sentences[1].demoIndex },
  ];
  const targetsRef = useRef(targets);
  const [view, setView] = useState<DemoView>(INITIAL);
  const viewRef = useRef(view);
  const visitorPanel = useRef<PanelView | null>(null);
  const runRef = useRef<Run | null>(null);
  const hasStarted = useRef(false);
  const cardRef = useRef<HTMLElement | null>(null);
  const wordRefs = useRef(new Map<string, HTMLElement>());
  const ctxRef = useRef<HTMLButtonElement | null>(null);
  const reduced = usePrefersReduced();

  const patch = useCallback((next: Partial<DemoView>) => {
    viewRef.current = { ...viewRef.current, ...next };
    setView(viewRef.current);
  }, []);

  const registerWord = useCallback(
    (sentence: number, index: number) => (element: HTMLElement | null) => {
      const key = `${sentence}:${index}`;
      if (element) wordRefs.current.set(key, element);
      else wordRefs.current.delete(key);
    },
    [],
  );

  const anchorOf = (element: HTMLElement | null, edge: 'center' | 'end' | 'start') => {
    const card = cardRef.current;
    if (!card || !element) return null;
    const a = element.getBoundingClientRect();
    const b = card.getBoundingClientRect();
    const x = edge === 'center' ? a.left + a.width / 2 : edge === 'end' ? a.right : a.left;
    return { x: x - b.left, y: a.bottom - b.top - 4 };
  };

  const moveCursor = async (
    run: Run,
    element: HTMLElement | null,
    edge: 'center' | 'end' | 'start',
    ms: number,
  ) => {
    const point = anchorOf(element, edge);
    if (!point) return;
    patch({ cursor: { ...point, visible: true, pressed: false, ms } });
    await run.sleep(ms);
  };

  const pressCursor = async (run: Run) => {
    patch({ cursor: { ...viewRef.current.cursor, pressed: true, ms: 0 } });
    await run.sleep(TIMING.pressMs);
    patch({ cursor: { ...viewRef.current.cursor, pressed: false } });
  };

  const showWord = useCallback(
    (target: DemoTarget, byVisitor: boolean) =>
      patch({
        panel: { kind: 'word', ...target, ctxChars: null },
        hit: target,
        selection: null,
        byVisitor,
      }),
    [patch],
  );

  const streamContext = async (run: Run, target: DemoTarget, byVisitor: boolean) => {
    const length = Array.from(set.sentences[target.sentence].context).length;
    for (let n = 1; n <= length; n++) {
      patch({ panel: { kind: 'word', ...target, ctxChars: n }, byVisitor });
      await run.sleep(TIMING.streamCharMs);
    }
    patch({ panel: { kind: 'word', ...target, ctxChars: Infinity }, byVisitor });
  };

  const cursorClickWord = async (run: Run, target: DemoTarget) => {
    await moveCursor(
      run,
      wordRefs.current.get(`${target.sentence}:${target.index}`) ?? null,
      'center',
      TIMING.moveToWordMs,
    );
    await pressCursor(run);
    showWord(target, false);
  };

  const cursorClickContext = async (run: Run, target: DemoTarget) => {
    await moveCursor(run, ctxRef.current, 'center', TIMING.moveToButtonMs);
    await pressCursor(run);
    await streamContext(run, target, false);
  };

  const cursorDrag = async (run: Run, sentence: number) => {
    const count = sentences[sentence].tokens.length;
    const words: number[] = [];
    for (let i = 0; i < count; i++) if (wordRefs.current.has(`${sentence}:${i}`)) words.push(i);
    await moveCursor(
      run,
      wordRefs.current.get(`${sentence}:${words[0]}`) ?? null,
      'start',
      TIMING.moveToWordMs,
    );
    patch({ hit: null, selection: null });
    for (const index of words) {
      patch({
        selection: { sentence, from: words[0], to: index },
        cursor: {
          ...(anchorOf(wordRefs.current.get(`${sentence}:${index}`) ?? null, 'end') ??
            viewRef.current.cursor),
          visible: true,
          pressed: false,
          ms: TIMING.dragWordMs,
        },
      });
      await run.sleep(TIMING.dragWordMs);
    }
    patch({ panel: { kind: 'sentence', sentence }, byVisitor: false });
  };

  const guided = async (
    run: Run,
    phase: Phase,
    userAct: () => Promise<void>,
    autoAct: () => Promise<void>,
  ) => {
    patch({ phase, acting: false });
    const step = stepOfPhase(phase) as Step;
    const outcome = await run.waitForUser(step, TIMING.userStepMs);
    patch({ acting: true });
    if (outcome === 'timeout') await autoAct();
    else await userAct();
    patch({ cursor: { ...viewRef.current.cursor, visible: false }, acting: false });
  };

  const script = async (run: Run) => {
    const [first, second] = targetsRef.current;
    patch({ ...INITIAL, phase: 'auto', cursor: { ...HIDDEN_CURSOR, ...startPoint() } });
    await cursorClickWord(run, first);
    await run.sleep(TIMING.afterWordMs);
    await cursorClickContext(run, first);
    await run.sleep(TIMING.afterContextMs);
    await cursorDrag(run, 0);
    await run.sleep(TIMING.afterDragMs);

    patch({ panel: { kind: 'empty' }, hit: null, selection: null, cursor: HIDDEN_CURSOR });
    await run.sleep(400);

    await guided(
      run,
      'step-word',
      async () => {
        showWord(second, true);
        await run.sleep(350);
      },
      async () => {
        await cursorClickWord(run, second);
        await run.sleep(350);
      },
    );
    await guided(
      run,
      'step-context',
      async () => {
        await streamContext(run, second, true);
        await run.sleep(900);
      },
      async () => {
        await cursorClickContext(run, second);
        await run.sleep(900);
      },
    );
    await guided(
      run,
      'step-sentence',
      async () => {
        patch({
          panel: visitorPanel.current ?? { kind: 'sentence', sentence: 1 },
          hit: null,
          byVisitor: true,
        });
        await run.sleep(TIMING.afterUserDragMs);
      },
      async () => {
        await cursorDrag(run, 1);
        await run.sleep(TIMING.afterUserDragMs);
      },
    );
    patch({ phase: 'done', acting: false, hit: null });
  };

  const startPoint = () => {
    const card = cardRef.current;
    return { x: card ? card.clientWidth - 40 : 0, y: 8 };
  };

  const stop = useCallback(() => {
    runRef.current?.cancel();
    runRef.current = null;
    const current = viewRef.current;
    patch({
      phase: 'free',
      acting: false,
      cursor: { ...current.cursor, visible: false, pressed: false },
      selection:
        current.panel.kind === 'word' || current.panel.kind === 'empty' ? null : current.selection,
    });
  }, [patch]);

  // `script` reads `set`, which never changes: the card is keyed by its set id.
  const start = useCallback(() => {
    runRef.current?.cancel();
    hasStarted.current = true;
    const run = new Run();
    runRef.current = run;
    script(run).catch((error: unknown) => {
      if (!(error instanceof RunCancelled)) throw error;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const interact = useCallback(
    (action: Interaction, panel?: PanelView) => {
      visitorPanel.current = panel ?? null;
      const phase = viewRef.current.phase;
      const verdict = judge(phase, action, targetsRef.current[1]);
      if (verdict === 'advance') {
        runRef.current?.complete(stepOfPhase(phase) as Step);
        return;
      }
      if (verdict === 'takeover') stop();
      if (action.kind === 'word') {
        showWord({ sentence: action.sentence, index: action.index }, true);
      } else if (action.kind === 'context') {
        const panel = viewRef.current.panel;
        if (panel.kind === 'word') {
          patch({ panel: { ...panel, ctxChars: Infinity }, byVisitor: true });
        }
      } else {
        patch({
          panel: panel ?? { kind: 'sentence', sentence: action.sentence },
          hit: null,
          byVisitor: true,
        });
      }
    },
    [patch, showWord, stop],
  );

  const pressWord = useCallback(
    (sentence: number, index: number, pointerType: string) => {
      if (pointerType === 'touch') return;
      const verdict = judgePress(viewRef.current.phase, sentence, index, targetsRef.current[1]);
      if (verdict === 'takeover') stop();
    },
    [stop],
  );

  const setSelection = useCallback((selection: Selection | null) => patch({ selection }), [patch]);

  const selectSpan = useCallback(
    (sentence: number, from: number, to: number) => {
      const spanned = resolveSpan(set.learn, sentence, from, to);
      interact(
        { kind: 'sentence', sentence },
        spanned.kind === 'phrase'
          ? { kind: 'phrase', sentence, from: spanned.from, to: spanned.to }
          : { kind: 'sentence', sentence },
      );
      patch({ selection: { sentence, from: spanned.from, to: spanned.to } });
    },
    [interact, patch, set.learn],
  );

  useEffect(() => {
    const card = cardRef.current;
    if (!card || reduced) return;
    let inView = false;
    const startOnce = () => {
      if (inView && !hasStarted.current && !document.hidden) start();
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting && entry.intersectionRatio >= 0.3;
        if (!entry.isIntersecting && runRef.current) stop();
        startOnce();
      },
      { threshold: [0, 0.3] },
    );
    observer.observe(card);
    const onVisibility = () => {
      if (document.hidden && runRef.current) stop();
      startOnce();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      runRef.current?.cancel();
      runRef.current = null;
    };
  }, [reduced, start, stop]);

  useEffect(() => {
    if (!reduced) return;
    runRef.current?.cancel();
    runRef.current = null;
    const target = targetsRef.current[1];
    patch({
      ...INITIAL,
      phase: 'done',
      panel: { kind: 'word', ...target, ctxChars: Infinity },
      hit: target,
    });
  }, [reduced, patch]);

  return {
    view,
    reduced,
    cardRef,
    ctxRef,
    registerWord,
    targets: targetsRef.current,
    start,
    stop,
    interact,
    pressWord,
    setSelection,
    selectSpan,
  };
}
