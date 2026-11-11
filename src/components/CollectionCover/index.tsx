import { coverTheme } from './theme';

interface CollectionCoverProps {
  /** Stable per collection, so the colour does not change between visits. */
  seed: string;
  title: string;
  author?: string;
  /** A collection of one lesson is drawn as a page, not as a bound book. */
  article?: boolean;
  /** A painting that carries no title; the cover sets the title over it. */
  artUrl?: string;
  variant?: 'card' | 'thumb';
}

/**
 * The cover of a collection that has no cover image of its own: a painting with the title set
 * over it, or a drawn cover. The card repeats the title as text.
 */
export default function CollectionCover({
  seed,
  title,
  author,
  article = false,
  artUrl,
  variant = 'card',
}: CollectionCoverProps) {
  const theme = coverTheme(seed);
  const cloth = { backgroundColor: theme.background, color: theme.foreground };

  if (artUrl) {
    return (
      <div
        aria-hidden="true"
        data-testid="collection-cover"
        className="relative h-full w-full"
        style={{ backgroundColor: theme.background }}
      >
        <img src={artUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        {variant === 'card' && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-3 pt-10 pb-3 text-[#fffdf7]">
            <p className="line-clamp-3 font-serif text-base leading-snug font-bold text-balance">
              {title}
            </p>
            {author && <p className="mt-1 line-clamp-1 text-xs opacity-90">{author}</p>}
          </div>
        )}
      </div>
    );
  }

  if (variant === 'thumb') {
    return (
      <div
        aria-hidden="true"
        data-testid="collection-cover"
        className="flex h-full w-full items-center justify-center font-serif text-xl font-bold"
        style={cloth}
      >
        {Array.from(title.trim())[0]?.toUpperCase()}
      </div>
    );
  }

  if (article) {
    return (
      <div
        aria-hidden="true"
        data-testid="collection-cover"
        className="flex h-full w-full flex-col bg-card"
      >
        <div className="h-2 w-full shrink-0" style={{ backgroundColor: theme.background }} />
        <div className="flex min-h-0 flex-1 flex-col p-3">
          {author && (
            <p className="truncate pr-8 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {author}
            </p>
          )}
          <p className="mt-1 line-clamp-5 font-serif text-sm leading-snug font-semibold text-foreground">
            {title}
          </p>
          <div className="mt-auto space-y-1.5 pt-3">
            <span className="block h-1 w-full rounded-full bg-muted" />
            <span className="block h-1 w-11/12 rounded-full bg-muted" />
            <span className="block h-1 w-2/3 rounded-full bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      data-testid="collection-cover"
      className="relative flex h-full w-full flex-col justify-between py-4 pr-3 pl-5"
      style={cloth}
    >
      <span className="absolute inset-y-0 left-0 w-2 bg-black/20" />
      <p className="line-clamp-5 font-serif text-base leading-snug font-bold text-balance">
        {title}
      </p>
      <div>
        <span className="mb-2 block h-px w-8 bg-current opacity-60" />
        {author && <p className="line-clamp-2 text-xs opacity-90">{author}</p>}
      </div>
    </div>
  );
}
