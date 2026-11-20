import { BookOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export default function EmptyState({
  onAddStarter,
  isAddingStarter = false,
}: {
  /** Present only when the active language has an unseeded starter pack (#315). */
  onAddStarter?: () => void;
  isAddingStarter?: boolean;
}) {
  const t = useTranslations('library.empty');
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border py-4 text-sm text-muted-foreground">
      <BookOpen className="size-4" aria-hidden="true" />
      <p>{t('title')}</p>
      {onAddStarter && (
        <Button
          onClick={onAddStarter}
          disabled={isAddingStarter}
          variant="ghost"
          data-testid="add-starter-content"
        >
          {isAddingStarter ? t('adding') : t('addStarter')}
        </Button>
      )}
    </div>
  );
}
