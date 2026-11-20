'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { isPushAvailable, useIsNativeApp } from '@/lib/native-app';
import {
  disableReminder,
  enableReminder,
  loadReminderPrefs,
  refreshDevice,
  saveReminderPrefs,
  type ReminderPrefs,
} from '@/lib/push';

/** Daily review reminder. Shown only in the iPhone app, and only when its shell has the push plugin. */
export default function ReminderSettings() {
  const t = useTranslations('settings.reminder');
  const locale = useLocale();
  const inApp = useIsNativeApp();
  const available = inApp && isPushAvailable();
  const [prefs, setPrefs] = useState<ReminderPrefs | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!available) return;
    void loadReminderPrefs()
      .then((loaded) => {
        setPrefs(loaded);
        if (loaded?.enabled) void refreshDevice(locale);
      })
      .catch(() => {});
  }, [available, locale]);

  if (!available || !prefs) return null;

  async function toggle(enabled: boolean) {
    if (!prefs) return;
    setBusy(true);
    try {
      if (enabled) {
        const result = await enableReminder(prefs.time, locale);
        if (result === 'ok') setPrefs({ ...prefs, enabled: true });
        toast[result === 'ok' ? 'success' : 'error'](
          t(result === 'ok' ? 'saved' : result === 'denied' ? 'denied' : 'failed'),
        );
      } else if (await disableReminder(prefs.time)) {
        setPrefs({ ...prefs, enabled: false });
        toast.success(t('off'));
      } else {
        toast.error(t('failed'));
      }
    } catch {
      toast.error(t('failed'));
    } finally {
      setBusy(false);
    }
  }

  async function changeTime(time: string) {
    if (!prefs || !/^\d\d:\d\d$/.test(time)) return;
    const next = { ...prefs, time };
    setPrefs(next);
    try {
      if (next.enabled && !(await saveReminderPrefs(next))) throw new Error('save failed');
    } catch {
      toast.error(t('failed'));
    }
  }

  return (
    <section className="panel space-y-4 p-6" data-testid="reminder-settings">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-foreground">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('body')}</p>
      </div>
      <label className="flex items-center gap-3 text-sm font-medium text-foreground">
        <input
          type="checkbox"
          className="size-4"
          checked={prefs.enabled}
          disabled={busy}
          onChange={(e) => void toggle(e.target.checked)}
          data-testid="reminder-toggle"
        />
        {t('toggle')}
      </label>
      <div>
        <label htmlFor="reminder-time" className="mb-1 block text-sm font-medium text-foreground">
          {t('timeLabel')}
        </label>
        <Input
          id="reminder-time"
          type="time"
          value={prefs.time}
          onChange={(e) => void changeTime(e.target.value)}
          className="w-32"
        />
        <p className="mt-1 text-xs text-muted-foreground">{t('timeHint')}</p>
      </div>
    </section>
  );
}
