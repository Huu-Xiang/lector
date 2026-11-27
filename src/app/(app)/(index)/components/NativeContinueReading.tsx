'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import CollectionArtwork from '@/components/CollectionCard/CollectionArtwork';
import { getLessonsForCollection, type Collection } from '@/lib/data-layer';
import { useCollectionDisplay } from '@/lib/library-titles';
import { haptic } from '@/lib/native-app';
import { resumeReadingLesson } from './resume-reading';

export default function NativeContinueReading({ collection }: { collection: Collection }) {
  const t = useTranslations('library');
  const { title, original } = useCollectionDisplay(collection);
  const [resume, setResume] = useState<string | null>(null);
  const { id, onlyLessonId, lastReadAt } = collection;
  useEffect(() => {
    if (onlyLessonId) return;
    let cancelled = false;
    void getLessonsForCollection(id, { fresh: true })
      .then((lessons) => {
        if (!cancelled) setResume(resumeReadingLesson(lessons));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id, onlyLessonId, lastReadAt]);
  const lessonId = onlyLessonId || resume;
  if (!lessonId) return null;
  const progress = Math.max(0, Math.min(100, Math.round(collection.avgProgress)));
  return (
    <Link
      href={`/read/${lessonId}`}
      data-testid="native-continue-reading"
      onClick={() => {
        void haptic();
      }}
      className="mb-4 flex min-h-[76px] items-center gap-3 rounded-2xl border border-border/60 bg-card p-3 sm:hidden"
    >
      <div className="aspect-[3/4] w-12 shrink-0 overflow-hidden rounded-md" aria-hidden>
        <CollectionArtwork
          collection={collection}
          title={title}
          original={original}
          variant="thumb"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t('collection.continueReading')}
        </p>
        <p className="mt-0.5 line-clamp-1 text-[17px] font-semibold">{title}</p>
        <div className="mt-2 flex items-center gap-2">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--ios-fill)]"
            aria-hidden
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">{progress}%</span>
        </div>
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
