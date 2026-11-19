import { useTranslations } from 'next-intl';
import CollectionCover from '@/components/CollectionCover';
import type { Collection } from '@/lib/data-layer';

export default function CollectionArtwork({
  collection,
  title,
  original,
  variant = 'card',
}: {
  collection: Collection;
  title: string;
  original: string | null;
  variant?: 'card' | 'thumb';
}) {
  const t = useTranslations('library.card');

  if (collection.coverUrl && collection.coverKind !== 'art') {
    return (
      <img
        src={collection.coverUrl}
        alt={t('coverAlt', { title })}
        loading="lazy"
        className="h-full w-full object-cover"
      />
    );
  }

  return (
    <CollectionCover
      seed={collection.id}
      title={original ?? title}
      author={collection.author}
      article={Boolean(collection.onlyLessonId)}
      artUrl={collection.coverKind === 'art' ? collection.coverUrl : undefined}
      variant={variant}
    />
  );
}
