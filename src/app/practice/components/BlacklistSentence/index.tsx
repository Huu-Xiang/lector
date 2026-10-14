import { Button } from '@/components/ui/button';
import { Ban } from 'lucide-react';
import { CurrentSentence } from '../../types';
import { blacklistClozeSentence, unblacklistClozeSentence } from '@/lib/data-layer';
import { toast } from 'sonner';
import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';

export default function BlacklistSentence({
  current,
  onSentenceBlacklisted,
}: {
  current: CurrentSentence | null;
  onSentenceBlacklisted: () => void;
}) {
  const t = useTranslations('practice.blacklist');
  const [pendingBlacklist, setPendingBlacklist] = useState<string | null>(null);

  const handleUndoBlacklist = useCallback(async () => {
    try {
      if (pendingBlacklist) {
        await unblacklistClozeSentence(pendingBlacklist);
      }
    } catch (e) {
      console.error(e);
      toast.error(t('undoFailed'), {
        duration: 2000,
      });
    } finally {
      setPendingBlacklist(null);
    }
  }, [pendingBlacklist, t]);

  const clearPendingBlacklist = () => {
    setPendingBlacklist(null);
  };

  const handleBlacklist = useCallback(async () => {
    if (!current) return;

    try {
      setPendingBlacklist(current.sentence.id);
      await blacklistClozeSentence(current.sentence.id);

      toast.info(t('hidden'), {
        duration: 2000,
        action: {
          label: t('undo'),
          onClick: handleUndoBlacklist,
        },
        onDismiss: clearPendingBlacklist,
        onAutoClose: clearPendingBlacklist,
      });

      onSentenceBlacklisted();
    } catch (error) {
      setPendingBlacklist(null);
      toast.error(error instanceof Error ? error.message : t('hideFailed'));
    }
  }, [current, handleUndoBlacklist, onSentenceBlacklisted, t]);

  return (
    <Button type="button" variant="ghost" onClick={handleBlacklist} title={t('title')}>
      <Ban className="h-4 w-4" />
    </Button>
  );
}
