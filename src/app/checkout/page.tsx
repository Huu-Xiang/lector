'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Spinner } from '@/components/ui/spinner';

const PADDLE_JS = 'https://cdn.paddle.com/paddle/v2/paddle.js';

interface PaddleGlobal {
  Environment: { set(env: 'sandbox' | 'production'): void };
  Initialize(options: {
    token: string;
    checkout?: { settings: Record<string, unknown> };
    eventCallback?: (event: { name?: string }) => void;
  }): void;
}

declare global {
  interface Window {
    Paddle?: PaddleGlobal;
  }
}

/**
 * The approved-domain page the /subscribe screen sends a buyer to. Paddle.js
 * opens the overlay by itself for the `_ptxn` transaction in the URL.
 */
export default function CheckoutPage() {
  const t = useTranslations('checkoutPage');
  const locale = useLocale();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const env = window.__ENV__ ?? {};
    const token = env.PADDLE_CLIENT_TOKEN;
    const params = new URLSearchParams(window.location.search);
    if (!token || !params.get('_ptxn')) {
      const timer = setTimeout(() => setFailed(true), 0);
      return () => clearTimeout(timer);
    }
    const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
    const script = document.createElement('script');
    script.src = PADDLE_JS;
    script.async = true;
    script.onerror = () => setFailed(true);
    script.onload = () => {
      const paddle = window.Paddle;
      if (!paddle) {
        setFailed(true);
        return;
      }
      if (env.PADDLE_ENV === 'sandbox') paddle.Environment.set('sandbox');
      paddle.Initialize({
        token,
        checkout: {
          settings: {
            displayMode: 'overlay',
            theme,
            locale: locale.startsWith('zh') ? 'zh-Hans' : 'en',
            successUrl: `${window.location.origin}/subscribe?checkout=success`,
          },
        },
        eventCallback: (event) => {
          if (event.name === 'checkout.closed') window.location.replace('/subscribe');
        },
      });
    };
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, [locale]);

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-background px-4 text-sm text-foreground">
      {failed ? (
        <p data-testid="checkout-failed">{t('failed')}</p>
      ) : (
        <Spinner size="lg" label={t('opening')} className="text-primary" />
      )}
      <Link href="/subscribe" className="text-primary hover:underline">
        {t('back')}
      </Link>
    </div>
  );
}
