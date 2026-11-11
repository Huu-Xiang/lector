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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="panel p-3">
              <Block className="mb-3 aspect-[3/4] w-full" />
              <Block className="mb-2 h-4 w-3/4" />
              <Block className="h-3 w-1/2" />
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
