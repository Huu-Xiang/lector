'use client';

import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';

/** WeChat contact for Chinese-speaking users: the code is the author's own account. */
export default function FeedbackCard() {
  const t = useTranslations('settings.feedback');
  const locale = useLocale();
  if (!locale.startsWith('zh')) return null;
  return (
    <section className="panel flex flex-col gap-4 p-6 sm:flex-row" data-testid="feedback-card">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('body')}</p>
      </div>
      <Image
        src="/wechat-qr.jpg"
        alt={t('alt')}
        width={888}
        height={1137}
        unoptimized
        className="h-auto w-44 shrink-0 self-center rounded-lg bg-white sm:self-start"
      />
    </section>
  );
}
