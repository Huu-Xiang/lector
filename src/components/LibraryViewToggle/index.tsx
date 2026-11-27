'use client';

import { LayoutGrid, List } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLibraryView, type LibraryView } from '@/lib/library-view';

const OPTIONS: { id: LibraryView; Icon: typeof List }[] = [
  { id: 'grid', Icon: LayoutGrid },
  { id: 'list', Icon: List },
];

export default function LibraryViewToggle() {
  const t = useTranslations('library.view');
  const [view, setView] = useLibraryView();
  return (
    <div
      role="group"
      aria-label={t('label')}
      className="native-library-view inline-flex rounded-lg border border-border bg-card p-0.5"
    >
      {OPTIONS.map(({ id, Icon }) => (
        <button
          key={id}
          type="button"
          aria-pressed={view === id}
          aria-label={t(id)}
          title={t(id)}
          onClick={() => setView(id)}
          data-testid={`library-view-${id}`}
          className={`flex min-h-11 min-w-11 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:opacity-60 sm:min-h-8 sm:min-w-9 ${
            view === id
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
