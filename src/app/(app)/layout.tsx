import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import NavHeader from '@/components/NavHeader';
import ChatWidget from '@/components/ChatWidget';
import SessionOnly from '@/components/SessionOnly';
import PlanLimitPrompt from '@/components/PlanLimitPrompt';
import AiDataNotice from '@/components/AiDataNotice';

/**
 * Shared layout for core application routes. Provides the full i18n message
 * catalog (including heavy app-only namespaces omitted from RootLayout) and
 * mounts app-only chrome so public landing/auth/free-book routes stay light.
 */
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div className="flex min-h-dvh w-full flex-col sm:flex-row">
        <SessionOnly>
          <NavHeader />
        </SessionOnly>
        <div className="min-w-0 flex-1">{children}</div>
        <SessionOnly>
          <ChatWidget />
        </SessionOnly>
        <PlanLimitPrompt />
        <AiDataNotice />
        {/* Spacer for mobile bottom nav — invisible on sm+ */}
        <div className="app-bottom-spacer h-16 sm:hidden print:hidden" aria-hidden="true" />
      </div>
    </NextIntlClientProvider>
  );
}
