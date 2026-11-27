'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import { useIsNativePhone } from '@/lib/use-native-phone';

export default function WeChatContact() {
  const t = useTranslations('feedback.wechat');
  const nativePhone = useIsNativePhone();
  return (
    <details className="native-wechat-card panel group p-4 sm:p-5" data-testid="feedback-wechat">
      <summary
        className={
          nativePhone
            ? 'flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden'
            : 'cursor-pointer text-sm font-medium text-foreground'
        }
      >
        {t('summary')}
        {nativePhone && (
          <ChevronRight
            className="size-4 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none"
            aria-hidden
          />
        )}
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
