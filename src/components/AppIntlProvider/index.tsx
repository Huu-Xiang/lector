'use client';

import { useMemo } from 'react';
import { NextIntlClientProvider, useMessages } from 'next-intl';
import type { MessageTree } from '@/i18n/namespaces';

/** Merges app-only i18n namespaces with RootLayout's public/shell messages without re-serializing them. */
export default function AppIntlProvider({
  locale,
  appMessages,
  children,
}: {
  locale: string;
  appMessages: MessageTree;
  children: React.ReactNode;
}) {
  const parentMessages = useMessages();
  const merged = useMemo(
    () => ({ ...parentMessages, ...appMessages }),
    [parentMessages, appMessages],
  );

  return (
    <NextIntlClientProvider locale={locale} messages={merged}>
      {children}
    </NextIntlClientProvider>
  );
}
