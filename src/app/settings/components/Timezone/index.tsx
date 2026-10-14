import { Button } from '@/components/ui/button';
import { getSetting, setSetting } from '@/lib/data-layer';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

export default function Timezone() {
  const t = useTranslations('settings.timezone');
  // Time zone state (server-side setting — drives day rollover for daily
  // stats, streaks and review days; issue #108)
  const [timezone, setTimezone] = useState<string>('');
  const [timezones, setTimezones] = useState<string[]>([]);
  const [browserTimeZone, setBrowserTimeZone] = useState<string>('');

  // Load settings from localStorage on mount
  useEffect(() => {
    const init = () => {
      // Time zone: populate the IANA list and the saved value
      setBrowserTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
      const intlWithSupported = Intl as typeof Intl & {
        supportedValuesOf?: (key: 'timeZone') => string[];
      };
      setTimezones(
        intlWithSupported.supportedValuesOf ? intlWithSupported.supportedValuesOf('timeZone') : [],
      );
      getSetting<string>('timezone').then((tz) => {
        if (tz) setTimezone(tz);
      });
    };

    init();
  }, []);

  // Save the day-rollover time zone ('' = auto, server's zone)
  const saveTimezone = async (tz: string) => {
    setTimezone(tz);
    try {
      await setSetting('timezone', tz);
      toast.success(t('updated', { zone: tz }));
    } catch (e) {
      console.error(e);
      toast.error(t('failed'));
    }
  };

  return (
    <section className="panel p-6">
      <h2 className="mb-1 text-lg font-semibold text-foreground">{t('title')}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{t('description')}</p>
      <select
        value={timezone}
        onChange={(e) => saveTimezone(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
      >
        <option value="">{t('auto')}</option>
        {timezones.map((tz) => (
          <option key={tz} value={tz}>
            {tz}
          </option>
        ))}
      </select>
      {browserTimeZone && timezone !== browserTimeZone && (
        <Button variant="link" onClick={() => saveTimezone(browserTimeZone)} className="mt-3">
          {t('useDevice', { zone: browserTimeZone })}
        </Button>
      )}
    </section>
  );
}
