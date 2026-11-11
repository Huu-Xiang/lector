'use client';

import { Clock, Ellipsis } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import CollectionCover from '@/components/CollectionCover';
import type { Collection } from '@/lib/data-layer';
import { useCollectionDisplay } from '@/lib/library-titles';
import { useLibraryView } from '@/lib/library-view';
import { useShowDescriptions } from '@/lib/show-descriptions';

interface CollectionCardProps {
  collection: Collection;
}

export default function CollectionCard({ collection }: CollectionCardProps) {
  const t = useTranslations('library.card');
  const { title, original, description } = useCollectionDisplay(collection);
  const [showDescriptions] = useShowDescriptions();
  const [view] = useLibraryView();
  const progressPercent = Math.round(collection.avgProgress || 0);
  const article = Boolean(collection.onlyLessonId);
  const detailsHref = `/collection/${collection.id}`;
  // A collection of one lesson opens that lesson; its page stays one tap away for edits.
  const href = collection.onlyLessonId ? `/read/${collection.onlyLessonId}` : detailsHref;
  const lastRead = collection.lastReadAt
    ? formatLastRead(collection.lastReadAt, t)
    : t('notStarted');

  const ownCover = collection.coverUrl && collection.coverKind !== 'art';
  const cover = (variant: 'card' | 'thumb') =>
    ownCover ? (
      <img
        src={collection.coverUrl}
        alt={t('coverAlt', { title })}
        loading="lazy"
        className="h-full w-full object-cover"
      />
    ) : (
      <CollectionCover
        seed={collection.id}
        title={original ?? title}
        author={collection.author}
        article={article}
        artUrl={collection.coverKind === 'art' ? collection.coverUrl : undefined}
        variant={variant}
      />
    );

  const details = article && (
    <Link
      href={detailsHref}
      aria-label={t('details', { title })}
      title={t('details', { title })}
      data-testid="collection-details"
      className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-md bg-card/90 text-muted-foreground opacity-70 shadow-sm transition-opacity group-hover:opacity-100 before:absolute before:-inset-1.5 hover:text-foreground focus-visible:opacity-100"
    >
      <Ellipsis className="size-4" aria-hidden="true" />
    </Link>
  );

  if (view === 'list') {
    return (
      <div className="group relative">
        <Link
          href={href}
          data-testid="collection-row"
          className="flex items-stretch gap-4 overflow-hidden rounded-xl border border-border bg-card p-3 transition-shadow hover:shadow-lg"
        >
          <div className="relative aspect-[3/4] w-14 shrink-0 self-start overflow-hidden rounded-md bg-muted sm:w-16">
            {cover('thumb')}
          </div>
          <div className={`flex min-w-0 flex-1 flex-col ${article ? 'pr-10' : ''}`}>
            <h3 className="line-clamp-2 text-base font-semibold text-foreground">{title}</h3>
            {original && <p className="line-clamp-1 text-xs text-muted-foreground">{original}</p>}
            {collection.author && (
              <p className="truncate text-sm text-muted-foreground">{collection.author}</p>
            )}
            {showDescriptions && description && (
              <p
                className="mt-1 line-clamp-2 text-xs text-muted-foreground"
                data-testid="collection-description"
              >
                {description}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {lastRead}
              </span>
              {collection.lessonCount > 1 && (
                <span>{t('lessons', { count: collection.lessonCount })}</span>
              )}
              {progressPercent > 0 && <span>{t('complete', { percent: progressPercent })}</span>}
            </div>
            {progressPercent > 0 && (
              <div className="mt-1.5 h-1 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}
          </div>
        </Link>
        {details}
      </div>
    );
  }

  return (
    <div className="group relative h-full">
      <Link
        href={href}
        data-testid="collection-card"
        className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-lg"
      >
        <div className="relative aspect-[3/4] w-full overflow-hidden bg-muted">
          {cover('card')}
          {progressPercent > 0 && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-black/20">
              <div className="h-full bg-primary" style={{ width: `${progressPercent}%` }} />
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col p-3">
          <h3 className="line-clamp-2 text-sm font-semibold text-foreground">{title}</h3>
          {ownCover && original && (
            <p className="line-clamp-1 text-xs text-muted-foreground">{original}</p>
          )}
          {collection.author && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{collection.author}</p>
          )}
          {showDescriptions && description && (
            <p
              className="mt-1.5 line-clamp-3 text-xs text-muted-foreground"
              data-testid="collection-description"
            >
              {description}
            </p>
          )}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 pt-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {lastRead}
            </span>
            {progressPercent > 0 ? (
              <span>{t('complete', { percent: progressPercent })}</span>
            ) : (
              collection.lessonCount > 1 && (
                <span>{t('lessons', { count: collection.lessonCount })}</span>
              )
            )}
          </div>
        </div>
      </Link>
      {details}
    </div>
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
