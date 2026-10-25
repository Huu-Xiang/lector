'use client';

import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';

/** WeChat contact for Chinese-speaking users: the code is the author's own account. */
export default function FeedbackCard() {
  const t = useTranslations('settings.feedback');
  const locale = useLocale();
  if (!locale.startsWith('zh')) return null;
  return (
    <section
      id="feedback"
      className="panel flex scroll-mt-6 flex-col items-center gap-6 border-primary/40 p-6 sm:flex-row sm:p-8"
      data-testid="feedback-card"
    >
      <div className="flex-1 space-y-3">
        <h2 className="text-2xl font-semibold text-foreground">{t('title')}</h2>
        <p className="text-base text-muted-foreground">{t('body')}</p>
      </div>
      <Image
        src="/wechat-qr.jpg"
        alt={t('alt')}
        width={888}
        height={1137}
        unoptimized
        className="h-auto w-64 shrink-0 rounded-xl bg-white shadow-md sm:w-72"
      />
    </section>
  );
}
