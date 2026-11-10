import { useCallback, useEffect, useRef } from 'react';
import { incrementDailyStat } from './data-layer';
import { createReadingActivity, subscribeToReadingActivity } from './reading-activity';

interface ReadingLesson {
  id: string;
  wordCount: number;
}

/** Records minutes and words read in the daily stats; returns the scroll-progress reporter. */
export function useReadingActivity(lesson: ReadingLesson | null) {
  const lessonId = lesson?.id ?? null;
  const wordCountRef = useRef(lesson?.wordCount ?? 0);
  useEffect(() => {
    wordCountRef.current = lesson?.wordCount ?? 0;
  });
  const activityRef = useRef<ReturnType<typeof createReadingActivity> | null>(null);

  useEffect(() => {
    if (!lessonId) return;
    const activity = createReadingActivity({
      wordCount: wordCountRef.current,
      send: (field, amount) => {
        incrementDailyStat(field, amount, { silentPlanLimit: true }).catch(() => undefined);
      },
    });
    activityRef.current = activity;
    const unsubscribe = subscribeToReadingActivity(activity, document, window);
    return () => {
      activity.tick(document.visibilityState === 'visible');
      unsubscribe();
      activityRef.current = null;
    };
  }, [lessonId]);

  return useCallback((percent: number) => activityRef.current?.noteProgress(percent), []);
}
