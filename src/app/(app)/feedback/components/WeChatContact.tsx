'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';

export default function WeChatContact() {
  const t = useTranslations('feedback.wechat');
  return (
    <details className="panel group p-4 sm:p-5" data-testid="feedback-wechat">
      <summary className="cursor-pointer text-sm font-medium text-foreground">
        {t('summary')}
      </summary>
      <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row">
        <p className="flex-1 text-sm text-muted-foreground">{t('body')}</p>
        <Image
          src="/wechat-qr.jpg"
          alt={t('alt')}
          width={888}
          height={1137}
          unoptimized
          className="h-auto w-56 shrink-0 rounded-xl bg-white shadow-md"
        />
      </div>
    </details>
  );
}
