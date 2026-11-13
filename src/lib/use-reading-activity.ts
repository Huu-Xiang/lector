import { useCallback, useEffect, useRef } from 'react';
import { incrementDailyStat } from './data-layer';
import { createReadingActivity, subscribeToReadingActivity } from './reading-activity';
import { trackProductEvent } from './product-analytics';

interface ReadingLesson {
  id: string;
  wordCount: number;
  language?: string;
  progress_percentComplete?: number;
}

/** Records minutes and words read in the daily stats; returns the scroll-progress reporter. */
export function useReadingActivity(lesson: ReadingLesson | null, analyticsEnabled = true) {
  const lessonId = lesson?.id ?? null;
  const lessonRef = useRef(lesson);
  const enabledRef = useRef(analyticsEnabled);
  useEffect(() => {
    lessonRef.current = lesson;
  });
  const activityRef = useRef<ReturnType<typeof createReadingActivity> | null>(null);

  useEffect(() => {
    if (!lessonId) return;
    const loaded = lessonRef.current;
    if (!loaded) return;
    const identity = { lessonId, language: loaded.language };
    const activity = createReadingActivity({
      wordCount: loaded.wordCount,
      initialPercent: loaded.progress_percentComplete,
      milestone: (event, value) => {
        trackProductEvent({ ...identity, event: `reading_${event}`, value });
      },
      activeMinutes: (value) => trackProductEvent({ ...identity, event: 'reading_time', value }),
      send: (field, amount) => {
        incrementDailyStat(field, amount, { silentPlanLimit: true }).catch(() => undefined);
      },
    });
    activity.setAnalyticsEnabled(enabledRef.current);
    activityRef.current = activity;
    let opened = false;
    const reportOpen = () => {
      if (opened || document.visibilityState !== 'visible') return;
      opened = true;
      trackProductEvent({ ...identity, event: 'reading_opened' });
    };
    document.addEventListener('visibilitychange', reportOpen);
    reportOpen();
    const unsubscribe = subscribeToReadingActivity(activity, document, window);
    return () => {
      activity.tick(document.visibilityState === 'visible');
      unsubscribe();
      document.removeEventListener('visibilitychange', reportOpen);
      activityRef.current = null;
    };
  }, [lessonId]);

  useEffect(() => {
    enabledRef.current = analyticsEnabled;
    activityRef.current?.setAnalyticsEnabled(analyticsEnabled);
  }, [analyticsEnabled]);

  return useCallback((percent: number, shortEnd?: boolean) => {
    if (shortEnd) activityRef.current?.noteShortEnd();
    else activityRef.current?.noteProgress(percent);
  }, []);
}
