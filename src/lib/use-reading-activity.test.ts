import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const effects = vi.hoisted(() => [] as Array<() => void | (() => void)>);
vi.mock('react', () => ({
  useRef: (initial: unknown) => ({ current: initial }),
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => void | (() => void)) => {
    effects.push(fn);
  },
}));

const incrementDailyStat = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('./data-layer', () => ({ incrementDailyStat }));

import { ACTIVE_WINDOW_MS } from './reading-activity';
import { useReadingActivity } from './use-reading-activity';

function stubBrowser() {
  const doc = new EventTarget() as EventTarget & { visibilityState: string };
  doc.visibilityState = 'visible';
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', new EventTarget());
  return doc;
}

describe('useReadingActivity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    effects.length = 0;
    incrementDailyStat.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('sends the words and minutes since the last tick when the reader leaves', () => {
    stubBrowser();
    const report = useReadingActivity({ id: 'lesson-1', wordCount: 1000 });
    const cleanups = effects.map((run) => run());
    report(0);
    window.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(ACTIVE_WINDOW_MS - 1000);
    report(50);
    incrementDailyStat.mockClear();

    const cleanup = cleanups.find((c) => typeof c === 'function') as () => void;
    cleanup();

    expect(incrementDailyStat).toHaveBeenCalledWith('wordsRead', 500, { silentPlanLimit: true });
  });

  it('sends nothing for a lesson that was never read', () => {
    stubBrowser();
    useReadingActivity({ id: 'lesson-1', wordCount: 1000 });
    const cleanups = effects.map((run) => run());
    incrementDailyStat.mockClear();
    (cleanups.find((c) => typeof c === 'function') as () => void)();
    expect(incrementDailyStat).not.toHaveBeenCalled();
  });
});
