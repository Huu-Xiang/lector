import { describe, expect, it } from 'vitest';
import type { LessonSummary } from '@/lib/data-layer';
import { resumeReadingLesson } from './resume-reading';

function chapter(id: string, changes: Partial<LessonSummary> = {}): LessonSummary {
  return {
    id,
    collectionId: 'book',
    title: id,
    sortOrder: 0,
    progress_scrollPosition: 0,
    progress_percentComplete: 0,
    wordCount: 100,
    createdAt: '2026-11-01',
    lastReadAt: '2026-11-01',
    ...changes,
  };
}

describe('resumeReadingLesson', () => {
  it('resumes the most recently started readable unfinished chapter', () => {
    expect(
      resumeReadingLesson([
        chapter('first', { progress_percentComplete: 20, lastReadAt: '2026-11-20' }),
        chapter('recent', { progress_scrollPosition: 100, lastReadAt: '2026-11-25' }),
        chapter('completed', { progress_percentComplete: 95, lastReadAt: '2026-11-27' }),
        chapter('pending', {
          progress_percentComplete: 20,
          transcriptionStatus: 'pending',
          lastReadAt: '2026-11-28',
        }),
      ]),
    ).toBe('recent');
  });
  it('falls back to the first unread chapter and excludes unfinished transcriptions', () => {
    expect(
      resumeReadingLesson([
        chapter('pending', { transcriptionStatus: 'pending' }),
        chapter('ready'),
      ]),
    ).toBe('ready');
    expect(resumeReadingLesson([chapter('done', { progress_percentComplete: 100 })])).toBeNull();
    expect(resumeReadingLesson([])).toBeNull();
  });
});
