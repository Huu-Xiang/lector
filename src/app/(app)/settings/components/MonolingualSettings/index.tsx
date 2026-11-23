'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getSetting, setSetting } from '@/lib/data-layer';
import { invalidateLookupCache } from '@/lib/dictionary-client';

export default function MonolingualSettings({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('settings.monolingual');
  const [enabled, setEnabled] = useState(false);
  const touched = useRef(false);
  const hint = useId();

  useEffect(() => {
    getSetting<boolean | null>('monolingualExplanations')
      .then((value) => {
        // A failed read is undefined; a tap made before the read wins.
        if (value !== undefined && !touched.current) setEnabled(value === true);
      })
      .catch(() => undefined);
  }, []);

  const handleChanged = async (next: boolean) => {
    touched.current = true;
    const previous = enabled;
    setEnabled(next);
    try {
      await setSetting('monolingualExplanations', next);
      invalidateLookupCache();
    } catch {
      setEnabled(previous);
      toast.error(t('failed'));
    }
  };

  return (
    <div data-testid="monolingual-settings">
      <h3 className="mb-1 text-sm font-semibold text-foreground">{t('title')}</h3>
      <p
        id={hint}
        className={
          compact ? 'mb-2 text-xs text-muted-foreground' : 'mb-3 text-sm text-muted-foreground'
        }
      >
        {t('description')}
      </p>
      <div className="flex gap-2" role="group" aria-label={t('title')} aria-describedby={hint}>
        <Button
          aria-pressed={enabled}
          data-testid="monolingual-explanations-on"
          className={compact ? 'min-h-11' : undefined}
          onClick={() => void handleChanged(true)}
          variant={enabled ? 'default' : 'secondary'}
        >
          {t('on')}
        </Button>
        <Button
          aria-pressed={!enabled}
          data-testid="monolingual-explanations-off"
          className={compact ? 'min-h-11' : undefined}
          onClick={() => void handleChanged(false)}
          variant={enabled ? 'secondary' : 'default'}
        >
          {t('off')}
        </Button>
      </div>
    </div>
  );
}
