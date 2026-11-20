import { Button } from '@/components/ui/button';
import { Ban } from 'lucide-react';
import { CurrentSentence } from '../../types';
import { blacklistClozeSentence, unblacklistClozeSentence } from '@/lib/data-layer';
import { toast } from 'sonner';
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';

export const BLACKLIST_UNDO_DURATION_MS = 5000;

export async function performBlacklistWithUndo(
  sentenceId: string,
  deps: {
    blacklist: (id: string) => Promise<void>;
    unblacklist: (id: string) => Promise<void>;
    notifyHidden: (onUndo: () => Promise<void>, duration: number) => void;
    notifyUndoFailed: () => void;
    notifyHideFailed: (error: unknown) => void;
    onBlacklisted: () => void;
  },
): Promise<void> {
  try {
    await deps.blacklist(sentenceId);

    deps.notifyHidden(async () => {
      try {
        await deps.unblacklist(sentenceId);
      } catch (e) {
        console.error(e);
        deps.notifyUndoFailed();
      }
    }, BLACKLIST_UNDO_DURATION_MS);

    deps.onBlacklisted();
  } catch (error) {
    deps.notifyHideFailed(error);
  }
}

export default function BlacklistSentence({
  current,
  onSentenceBlacklisted,
}: {
  current: CurrentSentence | null;
  onSentenceBlacklisted: () => void;
}) {
  const t = useTranslations('practice.blacklist');

  const handleBlacklist = useCallback(async () => {
    if (!current) return;

    await performBlacklistWithUndo(current.sentence.id, {
      blacklist: blacklistClozeSentence,
      unblacklist: unblacklistClozeSentence,
      notifyHidden: (onUndo, duration) => {
        toast.info(t('hidden'), {
          duration,
          action: {
            label: t('undo'),
            onClick: () => {
              void onUndo();
            },
          },
        });
      },
      notifyUndoFailed: () => {
        toast.error(t('undoFailed'), { duration: 2000 });
      },
      notifyHideFailed: (error) => {
        toast.error(error instanceof Error ? error.message : t('hideFailed'));
      },
      onBlacklisted: onSentenceBlacklisted,
    });
  }, [current, onSentenceBlacklisted, t]);

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={handleBlacklist}
      title={t('title')}
      aria-label={t('title')}
    >
      <Ban className="h-4 w-4" />
    </Button>
  );
}
