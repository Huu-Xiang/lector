'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import CollectionArtwork from '@/components/CollectionCard/CollectionArtwork';
import { buttonVariants } from '@/components/ui/button';
import { getLessonsForCollection, type Collection } from '@/lib/data-layer';
import { useCollectionDisplay } from '@/lib/library-titles';

export function hasUnfinishedReading(book: Collection) {
  return book.avgProgress > 0 && book.avgProgress < (book.onlyLessonId ? 95 : 100);
}

export default function IPadFeaturedBook({ collection }: { collection: Collection }) {
  const t = useTranslations('library');
  const { title, original } = useCollectionDisplay(collection);
  const progress = Math.max(1, Math.min(99, Math.round(collection.avgProgress)));
  const hasProgress = hasUnfinishedReading(collection);
  const [resumeLesson, setResumeLesson] = useState<string | null>(null);
  const { id, onlyLessonId, lastReadAt } = collection;

  useEffect(() => {
    if (!hasProgress || onlyLessonId) return;
    let cancelled = false;

    getLessonsForCollection(id, { fresh: true })
      .then((lessons) => {
        if (cancelled) return;
        const readable = lessons.filter(
          (lesson) =>
            lesson.progress_percentComplete < 95 &&
            (lesson.transcriptionStatus == null || lesson.transcriptionStatus === 'done'),
        );
        const lastStarted = readable.reduce<(typeof readable)[number] | undefined>(
          (latest, lesson) => {
            if (lesson.progress_percentComplete <= 0 && lesson.progress_scrollPosition <= 0)
              return latest;
            return !latest || lesson.lastReadAt > latest.lastReadAt ? lesson : latest;
          },
          undefined,
        );
        setResumeLesson(lastStarted?.id ?? readable[0]?.id ?? null);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [hasProgress, id, onlyLessonId, lastReadAt]);

  const lessonId = onlyLessonId || (hasProgress ? resumeLesson : null);
  const href = lessonId ? `/read/${lessonId}` : `/collection/${id}`;

  return (
    <section
      className="ipad-featured-book"
      data-testid="ipad-featured-book"
      aria-labelledby="ipad-featured-title"
    >
      <div className="ipad-featured-cover" aria-hidden="true">
        <CollectionArtwork collection={collection} title={title} original={original} />
      </div>
      <div className="ipad-featured-copy">
        {hasProgress && (
          <p className="ipad-featured-progress">{t('card.complete', { percent: progress })}</p>
        )}
        <h2 id="ipad-featured-title" className="ipad-featured-title">
          {title}
        </h2>
        {collection.author && <p className="ipad-featured-author">{collection.author}</p>}
        {hasProgress && (
          <div className="ipad-featured-meter" aria-hidden="true">
            <div style={{ width: `${progress}%` }} />
          </div>
        )}
        <Link
          href={href}
          className={buttonVariants({ size: 'lg', className: 'ipad-featured-action' })}
        >
          {lessonId
            ? t(hasProgress ? 'collection.continueReading' : 'collection.row.read')
            : t('card.details', { title })}
          <ArrowRight aria-hidden="true" className="rtl:rotate-180" />
        </Link>
      </div>
    </section>
  );
}
