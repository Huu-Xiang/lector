/** A reader counts as active for this long after the last scroll, tap or key. */
export const ACTIVE_WINDOW_MS = 2 * 60_000;
const MINUTE_MS = 60_000;
export const TICK_MS = 30_000;

export type ReadingStatField = 'minutesRead' | 'wordsRead';

interface ReadingActivityOptions {
  /** Words in the lesson, to turn a scroll position into words. */
  wordCount: number;
  send: (field: ReadingStatField, amount: number) => void;
  now?: () => number;
}

/** Counts a minute per 60 s of visible, active reading, and the words above the furthest scroll point once. */
export function createReadingActivity({ wordCount, send, now = Date.now }: ReadingActivityOptions) {
  let lastActivityAt = -Infinity;
  let lastTickAt = now();
  let visible = true;
  let activeMs = 0;
  let peakPercent: number | null = null;
  let countedWords = 0;
  let pendingWords = 0;

  const wordsAt = (percent: number) =>
    Math.floor((Math.min(100, Math.max(0, percent)) / 100) * Math.max(0, wordCount));

  const settle = (t: number) => {
    if (visible) {
      const activeUntil = Math.min(t, lastActivityAt + ACTIVE_WINDOW_MS);
      activeMs += Math.max(0, activeUntil - lastTickAt);
    }
    lastTickAt = t;
  };

  return {
    noteActivity() {
      const t = now();
      if (t - lastActivityAt > ACTIVE_WINDOW_MS) settle(t);
      lastActivityAt = t;
    },

    /** The first report only sets the baseline, so a restored scroll position counts nothing. */
    noteProgress(percent: number) {
      if (peakPercent === null) {
        peakPercent = percent;
        countedWords = wordsAt(percent);
        return;
      }
      if (percent <= peakPercent) return;
      peakPercent = percent;
      const total = wordsAt(percent);
      pendingWords += total - countedWords;
      countedWords = total;
    },

    tick(isVisible: boolean) {
      settle(now());
      visible = isVisible;
      const minutes = Math.floor(activeMs / MINUTE_MS);
      if (minutes > 0) {
        activeMs -= minutes * MINUTE_MS;
        send('minutesRead', minutes);
      }
      if (pendingWords > 0) {
        const words = pendingWords;
        pendingWords = 0;
        send('wordsRead', words);
      }
    },
  };
}

type Listenable = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
const ACTIVITY_EVENTS = ['scroll', 'wheel', 'pointerdown', 'keydown', 'touchstart'] as const;

export function subscribeToReadingActivity(
  activity: ReturnType<typeof createReadingActivity>,
  doc: Listenable & { visibilityState: string },
  win: Listenable,
  setTimer: typeof setInterval = setInterval,
  clearTimer: typeof clearInterval = clearInterval,
): () => void {
  const isVisible = () => doc.visibilityState === 'visible';
  const onActivity = () => activity.noteActivity();
  const onVisibility = () => activity.tick(isVisible());
  // Capture: scroll does not bubble, and the reader scrolls inside its own container.
  for (const type of ACTIVITY_EVENTS) {
    win.addEventListener(type, onActivity, { capture: true, passive: true });
  }
  doc.addEventListener('visibilitychange', onVisibility);
  const timer = setTimer(() => activity.tick(isVisible()), TICK_MS);
  activity.tick(isVisible());
  return () => {
    for (const type of ACTIVITY_EVENTS) win.removeEventListener(type, onActivity, true);
    doc.removeEventListener('visibilitychange', onVisibility);
    clearTimer(timer);
  };
}
