'use client';

import { BookOpen, Clock } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Collection } from '@/lib/data-layer';
import { useCollectionDisplay } from '@/lib/library-titles';
import { useShowDescriptions } from '@/lib/show-descriptions';

interface CollectionCardProps {
  collection: Collection;
}

export default function CollectionCard({ collection }: CollectionCardProps) {
  const t = useTranslations('library.card');
  const { title, original, description } = useCollectionDisplay(collection);
  const [showDescriptions] = useShowDescriptions();
  const progressPercent = Math.round(collection.avgProgress || 0);

  return (
    <Link
      href={`/collection/${collection.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-border hover:shadow-lg"
    >
      {/* Cover Image */}
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-muted">
        {collection.coverUrl ? (
          <img
            src={collection.coverUrl}
            alt={t('coverAlt', { title })}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
            <BookOpen className="mb-2 h-12 w-12 text-muted-foreground" strokeWidth={1.5} />
            <span className="text-sm font-medium text-muted-foreground">
              {title.substring(0, 30)}
            </span>
          </div>
        )}

        {/* Progress overlay */}
        {progressPercent > 0 && (
          <div className="absolute right-0 bottom-0 left-0 border-t border-border bg-card p-3">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">
                {t('complete', { percent: progressPercent })}
              </span>
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Collection Info */}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 text-base font-semibold text-foreground">{title}</h3>
        {original && <p className="line-clamp-1 text-xs text-muted-foreground">{original}</p>}
        {collection.author && (
          <p className="mt-1 truncate text-sm text-muted-foreground">{collection.author}</p>
        )}
        {showDescriptions && description && (
          <p
            className="mt-2 line-clamp-3 text-xs text-muted-foreground"
            data-testid="collection-description"
          >
            {description}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {collection.lastReadAt ? formatLastRead(collection.lastReadAt, t) : t('notStarted')}
          </span>
          {collection.lessonCount > 1 && (
            <span className="text-xs text-muted-foreground">
              {t('lessons', { count: collection.lessonCount })}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function formatLastRead(dateStr: string, t: ReturnType<typeof useTranslations>): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return t('today');
  if (days === 1) return t('yesterday');
  if (days < 7) return t('daysAgo', { count: days });
  if (days < 30) return t('weeksAgo', { count: Math.floor(days / 7) });
  return t('monthsAgo', { count: Math.floor(days / 30) });
}
