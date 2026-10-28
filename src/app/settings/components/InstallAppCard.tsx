'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { promptInstall, useInstallPlatform, type InstallPlatform } from '@/lib/pwa';

const STEPS: Partial<Record<InstallPlatform, string[]>> = {
  ios: ['ios1', 'ios2', 'ios3'],
  wechat: ['wechat1', 'wechat2'],
  android: ['android1', 'android2'],
};

/** "Add to home screen" help; hidden once Readfox runs as an installed app. */
export default function InstallAppCard() {
  const t = useTranslations('settings.installApp');
  const platform = useInstallPlatform();
  if (platform === 'unknown' || platform === 'installed') return null;

  const steps = STEPS[platform];

  return (
    <section
      id="install"
      className="panel scroll-mt-6 space-y-4 p-6"
      data-testid="install-app-card"
      data-platform={platform}
    >
      <div>
        <h2 className="mb-1 text-lg font-semibold text-foreground">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('body')}</p>
      </div>
      {platform === 'prompt' && (
        <Button onClick={() => void promptInstall()} data-testid="install-app-button">
          {t('install')}
        </Button>
      )}
      {steps && (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground">
          {steps.map((key) => (
            <li key={key}>{t(`steps.${key}`)}</li>
          ))}
        </ol>
      )}
      {platform === 'desktop' && <p className="text-sm text-foreground">{t('desktop')}</p>}
    </section>
  );
}
