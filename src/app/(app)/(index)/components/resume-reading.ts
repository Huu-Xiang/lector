import type { LessonSummary } from '@/lib/data-layer';

export function resumeReadingLesson(lessons: LessonSummary[]): string | null {
  const readable = lessons.filter(
    (lesson) =>
      lesson.progress_percentComplete < 95 &&
      (lesson.transcriptionStatus == null || lesson.transcriptionStatus === 'done'),
  );
  const started = readable.filter(
    (lesson) => lesson.progress_percentComplete > 0 || lesson.progress_scrollPosition > 0,
  );
  const latest = started.reduce<LessonSummary | undefined>(
    (current, lesson) => (!current || lesson.lastReadAt > current.lastReadAt ? lesson : current),
    undefined,
  );
  return latest?.id ?? readable[0]?.id ?? null;
}
