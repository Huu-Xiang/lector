/** A reader counts as active for this long after the last scroll, tap or key. */
export const ACTIVE_WINDOW_MS = 2 * 60_000;
const MINUTE_MS = 60_000;
export const TICK_MS = 30_000;

export type ReadingStatField = 'minutesRead' | 'wordsRead';
export type ReadingMilestone = 'started' | 'progress' | 'completed';
const PROGRESS_MILESTONES = [25, 50, 75, 90];

interface ReadingActivityOptions {
  /** Words in the lesson, to turn a scroll position into words. */
  wordCount: number;
  send: (field: ReadingStatField, amount: number) => void;
  initialPercent?: number;
  milestone?: (event: ReadingMilestone, value?: number) => void;
  activeMinutes?: (amount: number) => void;
  now?: () => number;
}

/** Counts a minute per 60 s of visible, active reading, and the words above the furthest scroll point once. */
export function createReadingActivity({
  wordCount,
  send,
  initialPercent = 0,
  milestone,
  activeMinutes,
  now = Date.now,
}: ReadingActivityOptions) {
  let lastActivityAt = -Infinity;
  let lastTickAt = now();
  let visible = true;
  let activeMs = 0;
  let peakPercent: number | null = null;
  let countedWords = 0;
  let pendingWords = 0;
  let lastReaderInputAt = -Infinity;
  let analyticsEnabled = true;
  let analyticsActiveMs = 0;
  let reportedAnalyticsMinutes = 0;
  let effectiveReading = false;
  let highestMilestone = initialPercent;
  let freshPercent = initialPercent;
  let shortEnd = false;
  let completed = false;

  const wordsAt = (percent: number) =>
    Math.floor((Math.min(100, Math.max(0, percent)) / 100) * Math.max(0, wordCount));

  const settle = (t: number) => {
    if (visible) {
      const activeUntil = Math.min(t, lastActivityAt + ACTIVE_WINDOW_MS);
      activeMs += Math.max(0, activeUntil - lastTickAt);
      if (analyticsEnabled) {
        const inputUntil = Math.min(t, lastReaderInputAt + ACTIVE_WINDOW_MS);
        analyticsActiveMs += Math.max(0, inputUntil - lastTickAt);
      }
    }
    lastTickAt = t;
  };

  const publishMilestones = () => {
    if (!milestone) return;
    if (!effectiveReading && analyticsActiveMs >= MINUTE_MS) {
      effectiveReading = true;
      milestone('started');
    }
    if (!effectiveReading) return;
    for (const point of PROGRESS_MILESTONES) {
      if (point > highestMilestone && point <= freshPercent) {
        highestMilestone = point;
        milestone('progress', point);
      }
    }
    if (!completed && (shortEnd || (initialPercent < 90 && freshPercent >= 90))) {
      completed = true;
      milestone('completed');
    }
  };

  return {
    noteActivity(readerInput = true, trustedScroll = false) {
      const t = now();
      // A restore can trigger a trusted scroll, so only a recent reader input may extend it.
      const readingInput =
        readerInput || (trustedScroll && t - lastReaderInputAt <= ACTIVE_WINDOW_MS);
      if (
        t - lastActivityAt > ACTIVE_WINDOW_MS ||
        (readingInput && t - lastReaderInputAt > ACTIVE_WINDOW_MS)
      ) {
        settle(t);
      }
      lastActivityAt = t;
      if (readingInput && visible && analyticsEnabled) lastReaderInputAt = t;
    },

    setAnalyticsEnabled(enabled: boolean) {
      if (enabled === analyticsEnabled) return;
      settle(now());
      analyticsEnabled = enabled;
      lastReaderInputAt = -Infinity;
    },

    /** The first report only sets the baseline, so a restored scroll position counts nothing. */
    noteProgress(percent: number) {
      if (analyticsEnabled && visible && now() - lastReaderInputAt <= ACTIVE_WINDOW_MS) {
        freshPercent = Math.max(freshPercent, percent);
        publishMilestones();
      }
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

    noteShortEnd() {
      if (!analyticsEnabled) return;
      shortEnd = true;
      publishMilestones();
    },

    tick(isVisible: boolean) {
      settle(now());
      visible = isVisible;
      publishMilestones();
      const analyticsMinutes = Math.floor(analyticsActiveMs / MINUTE_MS);
      if (analyticsMinutes > reportedAnalyticsMinutes) {
        activeMinutes?.(analyticsMinutes - reportedAnalyticsMinutes);
        reportedAnalyticsMinutes = analyticsMinutes;
      }
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
  const onActivity = (event: Event) =>
    activity.noteActivity(
      event.isTrusted && event.type !== 'scroll',
      event.isTrusted && event.type === 'scroll',
    );
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
