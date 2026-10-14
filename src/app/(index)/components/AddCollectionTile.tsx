import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export default function AddCollectionTile({
  value,
  onChange,
  onSubmit,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('library');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex min-h-[14rem] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border p-4"
    >
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
        placeholder={t('addTile.placeholder')}
        autoFocus
        data-testid="new-collection-input"
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" data-testid="new-collection-submit">
          {t('addTile.create')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
