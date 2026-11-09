'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { lectorMode } from '@/lib/api-base';
import { getProductEmails, setProductEmails } from '@/lib/product-emails';

export default function ProductEmails() {
  const t = useTranslations('settings.practice.emails');
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (lectorMode() !== 'cloud') return;
    getProductEmails()
      .then(setEnabled)
      .catch(() => undefined);
  }, []);

  if (enabled === null) return null;

  const handleChanged = async (next: boolean) => {
    const previous = enabled;
    setEnabled(next);
    try {
      await setProductEmails(next);
    } catch {
      setEnabled(previous);
      toast.error(t('failed'));
    }
  };

  return (
    <div id="product-emails" className="mt-8 scroll-mt-20" data-testid="product-emails">
      <h3 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {t('heading')}
      </h3>
      <label className="block text-sm font-medium text-foreground">{t('label')}</label>
      <p className="mb-2 text-xs text-muted-foreground">{t('hint')}</p>
      <div className="flex gap-2" role="group" aria-label={t('label')}>
        <Button
          aria-pressed={enabled}
          data-testid="product-emails-on"
          onClick={() => void handleChanged(true)}
          variant={enabled ? 'default' : 'secondary'}
        >
          {t('on')}
        </Button>
        <Button
          aria-pressed={!enabled}
          data-testid="product-emails-off"
          onClick={() => void handleChanged(false)}
          variant={enabled ? 'secondary' : 'default'}
        >
          {t('off')}
        </Button>
      </div>
    </div>
  );
}
