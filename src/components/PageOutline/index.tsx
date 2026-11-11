function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />;
}

export default function PageOutline({ variant }: { variant: 'cards' | 'list' | 'text' }) {
  return (
    <div aria-busy="true" data-testid="page-outline" className="w-full">
      {variant === 'text' ? (
        <div className="mx-auto max-w-2xl space-y-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Block className="h-4 w-full" />
              <Block className="h-4 w-11/12" />
              <Block className="h-4 w-4/5" />
            </div>
          ))}
        </div>
      ) : variant === 'cards' ? (
        <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="panel p-3 max-sm:space-y-1.5 max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0"
            >
              <Block className="aspect-[3/4] w-full sm:mb-3" />
              <Block className="h-3 w-3/4 sm:mb-2 sm:h-4" />
              <Block className="h-3 w-1/2 max-sm:hidden" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="panel p-4">
              <Block className="mb-2 h-4 w-2/3" />
              <Block className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
