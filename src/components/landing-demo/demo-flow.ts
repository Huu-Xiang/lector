export type Phase = 'auto' | 'step-word' | 'step-context' | 'step-sentence' | 'done' | 'free';
export type Step = 'word' | 'context' | 'sentence';

export type Interaction =
  | { kind: 'word'; sentence: number; index: number }
  | { kind: 'context' }
  | { kind: 'sentence'; sentence: number };

export type Verdict = 'advance' | 'takeover' | 'free';

export interface DemoTarget {
  sentence: number;
  index: number;
}

export const TIMING = {
  userStepMs: 8000,
  streamCharMs: 28,
  moveToWordMs: 800,
  moveToButtonMs: 700,
  pressMs: 130,
  dragWordMs: 105,
  afterWordMs: 1000,
  afterContextMs: 1500,
  afterDragMs: 2600,
  afterUserDragMs: 1500,
} as const;

const STEP_OF_PHASE: Partial<Record<Phase, Step>> = {
  'step-word': 'word',
  'step-context': 'context',
  'step-sentence': 'sentence',
};

/** What an interaction means in a phase. Only the prompted step advances a guided run. */
export function judge(phase: Phase, action: Interaction, target: DemoTarget): Verdict {
  if (phase === 'done' || phase === 'free') return 'free';
  const step = STEP_OF_PHASE[phase];
  if (step === 'word' && action.kind === 'word') {
    return action.sentence === target.sentence && action.index === target.index
      ? 'advance'
      : 'takeover';
  }
  if (step === 'context' && action.kind === 'context') return 'advance';
  if (step === 'sentence' && action.kind === 'sentence') {
    return action.sentence === target.sentence ? 'advance' : 'takeover';
  }
  return 'takeover';
}

/** A mouse press that must stop the run at once. A touch is judged when it ends, so a scroll never stops it. */
export function judgePress(
  phase: Phase,
  sentence: number,
  index: number,
  target: DemoTarget,
): 'takeover' | 'wait' {
  if (phase === 'done' || phase === 'free') return 'wait';
  if (phase === 'step-word')
    return sentence === target.sentence && index === target.index ? 'wait' : 'takeover';
  if (phase === 'step-sentence') return sentence === target.sentence ? 'wait' : 'takeover';
  return 'takeover';
}

export function stepOfPhase(phase: Phase): Step | null {
  return STEP_OF_PHASE[phase] ?? null;
}

export class RunCancelled extends Error {}

/** The ref that holds the active run drops a run that has ended, so `stop` cannot reset `done`. */
export function clearFinishedRun(active: Run | null, finished: Run): Run | null {
  return active === finished ? null : active;
}

/** One timeline. `cancel` rejects every pending wait, so a stopped run never moves again. */
export class Run {
  private cancelled = false;
  private pending = new Set<{ timer: ReturnType<typeof setTimeout>; reject: () => void }>();
  private waiting: { step: Step; settle: (outcome: 'user') => void } | null = null;

  get isCancelled(): boolean {
    return this.cancelled;
  }

  sleep(ms: number): Promise<void> {
    if (this.cancelled) return Promise.reject(new RunCancelled());
    return new Promise((resolve, reject) => {
      const entry = {
        timer: setTimeout(() => {
          this.pending.delete(entry);
          resolve();
        }, ms),
        reject: () => reject(new RunCancelled()),
      };
      this.pending.add(entry);
    });
  }

  /** Resolves `user` when `complete(step)` runs first, `timeout` after `ms`. */
  async waitForUser(step: Step, ms: number): Promise<'user' | 'timeout'> {
    if (this.cancelled) throw new RunCancelled();
    const user = new Promise<'user'>((resolve) => {
      this.waiting = { step, settle: resolve };
    });
    const timeout = this.sleep(ms).then(() => 'timeout' as const);
    timeout.catch(() => undefined);
    try {
      return await Promise.race([user, timeout]);
    } finally {
      this.waiting = null;
    }
  }

  complete(step: Step): boolean {
    if (!this.waiting || this.waiting.step !== step) return false;
    this.waiting.settle('user');
    return true;
  }

  cancel(): void {
    this.cancelled = true;
    for (const entry of this.pending) {
      clearTimeout(entry.timer);
      entry.reject();
    }
    this.pending.clear();
    this.waiting = null;
  }
}
