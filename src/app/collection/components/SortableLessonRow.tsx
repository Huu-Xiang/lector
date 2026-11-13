import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  BookOpenText,
  ChevronRight,
  Ellipsis,
  Check,
  GripVertical,
  LoaderCircle,
  RotateCcw,
  SquarePen,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { LessonSummary } from '@/types';
import Link from 'next/link';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { lessonHeading } from '@/lib/lesson-heading';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function SortableLessonRow({
  lesson,
  index,
  bookTitles,
  lessonCount,
  compact,
  onMove,
  onEdit,
  onDelete,
  onRetryTranscription,
}: {
  lesson: LessonSummary;
  index: number;
  /** Titles of the collection, used to spot a lesson title that only repeats them. */
  bookTitles: readonly string[];
  lessonCount: number;
  compact: boolean;
  onMove: (from: number, to: number) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string, title: string) => void;
  onRetryTranscription?: (id: string) => void;
}) {
  const t = useTranslations('library.collection.row');
  const tc = useTranslations('library.common');
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lesson.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };
  const progress = Math.round(lesson.progress_percentComplete);
  const isComplete = progress >= 95;
  const heading = lessonHeading(lesson, bookTitles, lessonCount);
  const transcribing =
    lesson.transcriptionStatus === 'pending' || lesson.transcriptionStatus === 'processing';
  const transcriptionFailed = lesson.transcriptionStatus === 'error';

  const CTALabel = useMemo(() => {
    if (progress === 0) {
      return t('read');
    }

    if (isComplete) {
      return t('reread');
    }

    return t('continue');
  }, [progress, isComplete, t]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1 ${compact ? 'px-2 py-1' : 'rounded-xl border border-border bg-card px-1 py-4 transition-all hover:border-border hover:shadow-sm sm:px-4 md:gap-3'} ${isDragging ? 'opacity-60 shadow-md' : ''}`}
    >
      {!compact && (
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={t('dragToReorder', { title: lesson.title })}
          data-testid={`drag-lesson-${lesson.id}`}
          className="flex-shrink-0 cursor-grab touch-none rounded-md p-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="h-5 w-5" />
        </button>
      )}

      <Link
        href={`/read/${lesson.id}`}
        title={heading}
        className="group flex min-h-11 min-w-0 flex-1 items-center gap-2 pr-2 md:gap-4 md:pr-0"
      >
        {/* Lesson number */}
        <div
          aria-hidden
          className={`flex flex-shrink-0 items-center justify-center rounded-full text-xs font-medium ${compact ? 'size-6' : 'size-8'} ${
            isComplete ? 'bg-[var(--primary-soft)] text-primary' : 'bg-muted text-muted-foreground'
          }`}
        >
          {isComplete ? (
            <Check className="h-4 w-4" />
          ) : compact ? (
            <ChevronRight className="size-3" />
          ) : (
            index + 1
          )}
        </div>

        <div className="min-w-0 flex-1">
          {/* Lesson info */}
          <div className="">
            <h3
              className={`text-sm font-medium text-foreground ${compact ? 'break-words' : 'truncate'}`}
              data-testid="lesson-heading"
            >
              {heading}
            </h3>
            {transcribing ? (
              <p
                className="flex items-center gap-1 text-xs text-muted-foreground"
                data-testid={`transcribing-${lesson.id}`}
              >
                <LoaderCircle className="h-3 w-3 animate-spin" />
                {t('transcribing')}
              </p>
            ) : transcriptionFailed ? (
              <p
                className="flex items-center gap-1 text-xs text-destructive"
                title={lesson.transcriptionError ?? undefined}
                data-testid={`transcription-error-${lesson.id}`}
              >
                <TriangleAlert className="h-3 w-3" />
                {t('transcriptionFailed')}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {tc('words', { count: lesson.wordCount })}
                {progress > 0 && !isComplete && ` · ${progress}%`}
              </p>
            )}
          </div>

          {/* Progress bar */}
          {progress > 0 && !isComplete && (
            <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>

        {!compact && (
          <div className="flex flex-shrink-0 items-center gap-3 text-sm text-muted-foreground group-hover:text-foreground">
            <span className="hidden md:block">{CTALabel}</span>
            <BookOpenText className="h-4 w-4" />
          </div>
        )}
      </Link>

      {compact ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-lg" />}
            aria-label={t('actions')}
          >
            <Ellipsis aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-max min-w-36">
            {transcriptionFailed && onRetryTranscription && (
              <DropdownMenuItem
                className="min-h-11"
                onClick={() => onRetryTranscription(lesson.id)}
              >
                <RotateCcw aria-hidden />
                {t('retryTranscription')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="min-h-11" onClick={() => onEdit(lesson.id)}>
              {t('edit')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-11"
              onClick={() => onMove(index, index - 1)}
              disabled={index === 0}
            >
              {t('moveUp')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-11"
              onClick={() => onMove(index, index + 1)}
              disabled={index === lessonCount - 1}
            >
              {t('moveDown')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-11"
              variant="destructive"
              onClick={() => onDelete(lesson.id, lesson.title)}
            >
              {t('delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <>
          {/* Retry transcription button (failed audio lessons only) */}
          {transcriptionFailed && onRetryTranscription && (
            <button
              onClick={() => onRetryTranscription(lesson.id)}
              className="flex-shrink-0 cursor-pointer rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              title={t('retryTranscription')}
              data-testid={`retry-transcription-${lesson.id}`}
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}

          {/* Edit button */}
          <button
            onClick={() => onEdit(lesson.id)}
            className="flex-shrink-0 cursor-pointer rounded-lg p-2 text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
            title={t('edit')}
            data-testid={`edit-lesson-${lesson.id}`}
          >
            <SquarePen className="h-4 w-4" />
          </button>

          {/* Delete button */}
          <button
            onClick={() => onDelete(lesson.id, lesson.title)}
            className="flex-shrink-0 cursor-pointer rounded-lg p-2 text-muted-foreground transition-all hover:bg-accent hover:text-destructive"
            title={t('delete')}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}
