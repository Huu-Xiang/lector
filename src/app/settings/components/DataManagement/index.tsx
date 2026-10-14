import { buttonVariants } from '@/components/ui/button';
import { apiUrl } from '@/lib/api-base';
import { importFromDexie } from '@/lib/data-layer';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

export default function DataManagement() {
  const t = useTranslations('settings.data');
  // Import a learning-data takeout (legacy backups remain supported server-side).
  const handleBackupImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate the takeout metadata before uploading it.
      if (!data.version || !data.exportedAt) {
        throw new Error(t('invalidFormat'));
      }

      // Use the server-side import API
      const result = await importFromDexie(data);

      if (result.success) {
        const counts = result.imported;
        toast.success(t('imported'), {
          description: t('importedDetail', {
            collections: counts.collections || 0,
            lessons: counts.lessons || 0,
            vocab: counts.vocab || 0,
            knownWords: counts.knownWords || 0,
            clozeSentences: counts.clozeSentences || 0,
          }),
        });
      } else {
        throw new Error(t('importFailedShort'));
      }
    } catch (error) {
      toast.error(
        t('importFailed', {
          message: error instanceof Error ? error.message : t('unknownError'),
        }),
        {},
      );
    }

    // Reset file input
    e.target.value = '';
  };

  return (
    <section className="rounded-lg border border-destructive/30 bg-card p-6">
      <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>
      <p className="mt-1 mb-4 max-w-2xl text-sm text-muted-foreground">{t('description')}</p>

      <div className="mb-6 flex flex-wrap gap-3">
        <a
          href={apiUrl('/api/data')}
          className={buttonVariants({ variant: 'secondary' })}
          data-testid="export-learning-data"
        >
          {t('export')}
        </a>
        <label className="cursor-pointer rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent">
          {t('import')}
          <input
            type="file"
            accept=".json"
            onChange={handleBackupImport}
            className="hidden"
            data-testid="import-learning-data"
          />
        </label>
      </div>
    </section>
  );
}
