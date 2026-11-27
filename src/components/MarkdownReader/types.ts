import type { ReactNode } from 'react';
import type { Lesson, LessonSummary, WordState } from '@/types';
import type { ConcordanceJumpPayload } from '@/lib/concordance-jump';
import type { WordHighlightMode } from './theme';

/** Where a clicked word came from, when the lesson is a video transcript
 *  (#334). Threaded to the reader page so a mined card can carry the segment's
 *  timestamped source link into the Anki export. */
export interface WordSource {
  /** Base watch URL of the source video (no timestamp). */
  sourceUrl: string;
  /** Segment start/end in milliseconds. */
  startMs: number;
  endMs: number;
}

export interface MarkdownReaderProps {
  lesson: Lesson;
  sectionTitle?: string;
  onWordClick: (
    word: string,
    sentence: string,
    source?: WordSource,
    occurrence?: string,
    options?: { isPhrase?: boolean },
  ) => void;
  /** Whether the word/phrase drawer this reader feeds is open. When it closes
   *  (Esc, the X, clicking away) the reader clears its word/phrase highlight. */
  wordPanelOpen?: boolean;
  onClose: () => void;
  /** Click on empty space: drop the word/phrase selection and close the drawer. */
  onClearSelection?: () => void;
  onSaveText?: (textContent: string) => Promise<void>;
  onEditingChange?: (isEditing: boolean) => void;
  /** Scroll progress, or a visible end in a lesson that fits without scrolling. */
  onProgress?: (percent: number, shortEnd?: boolean) => void;
  knownWordsMap: Map<string, WordState>;
  prevLesson?: Pick<LessonSummary, 'id' | 'title'> | null;
  nextLesson?: Pick<LessonSummary, 'id' | 'title'> | null;
  /** Extra header button(s), e.g. the listen-along toggle on audio lessons (#185). */
  headerAction?: ReactNode;
  /** One-shot concordance jump target from library search (KTD8). */
  concordanceJump?: ConcordanceJumpPayload | null;
  /** Called when the learner dismisses or clears the concordance highlight. */
  onDismissConcordanceJump?: () => void;
  /** Optional chapter-end wrap-up footer (e.g. Mark remaining new words as Known). */
  chapterFooter?: ReactNode;
  /** Increment to force-clear any active word/phrase highlight even while the drawer stays closed. */
  clearHighlightToken?: number;
  /** How body words are marked: 'saved' (subtle wash), 'smart' (predicted hard words), or 'clean'. */
  wordHighlightMode?: WordHighlightMode;
  /** Lowercased folded words predicted above the learner's reading level (used when mode === 'smart'). */
  smartHintWords?: ReadonlySet<string> | null;
}
