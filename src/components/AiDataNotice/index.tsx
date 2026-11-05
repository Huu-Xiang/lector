'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { apiFetch, registerAiRequestGuard } from '@/lib/api-base';
import { createAiNoticeGate, isAiRequest } from '@/lib/ai-notice';
import { isNativeApp } from '@/lib/native-app';

const SETTING = '/api/settings/aiNoticeAcceptedAt';

/** In the iPhone app, asks once for consent before any call that sends text to the AI provider. */
export default function AiDataNotice() {
  const t = useTranslations('reader.aiNotice');
  const [open, setOpen] = useState(false);
  const answer = useRef<((agreed: boolean) => void) | null>(null);

  useEffect(() => {
    if (!isNativeApp()) return;
    const ensure = createAiNoticeGate({
      readAcceptedAt: async () => {
        const res = await apiFetch(SETTING);
        const value: unknown = res.ok ? await res.json() : null;
        return typeof value === 'string' ? value : null;
      },
      showNotice: () =>
        new Promise<boolean>((resolve) => {
          answer.current = resolve;
          setOpen(true);
        }),
      saveAcceptedAt: async (at) => {
        await apiFetch(SETTING, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: at }),
        });
      },
    });
    registerAiRequestGuard(async (path, method) => !isAiRequest(path, method) || ensure());
    return () => registerAiRequestGuard(null);
  }, []);

  function finish(agreed: boolean) {
    setOpen(false);
    answer.current?.(agreed);
    answer.current = null;
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && finish(false)}>
      <DialogContent className="max-w-md space-y-3 p-6" data-testid="ai-notice">
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription>{t('body')}</DialogDescription>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => finish(false)} data-testid="ai-notice-decline">
            {t('decline')}
          </Button>
          <Button onClick={() => finish(true)} data-testid="ai-notice-agree">
            {t('agree')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
