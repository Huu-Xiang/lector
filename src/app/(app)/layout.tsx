import { getLocale, getMessages } from 'next-intl/server';
import AppIntlProvider from '@/components/AppIntlProvider';
import NavHeader from '@/components/NavHeader';
import ChatWidget from '@/components/ChatWidget';
import NativePageTransition from '@/components/NativeBridge/NativePageTransition';
import SessionOnly from '@/components/SessionOnly';
import PlanLimitPrompt from '@/components/PlanLimitPrompt';
import AiDataNotice from '@/components/AiDataNotice';
import { APP_ONLY_NAMESPACES, pickMessages, type MessageTree } from '@/i18n/namespaces';

/** Shared layout for core app routes; adds app-only i18n slices and chrome. */
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [locale, allMessages] = await Promise.all([getLocale(), getMessages()]);
  const appMessages = pickMessages(allMessages as MessageTree, APP_ONLY_NAMESPACES);

  return (
    <AppIntlProvider locale={locale} appMessages={appMessages}>
      <div className="app-shell flex min-h-0 w-full flex-1 flex-col sm:flex-row">
        <SessionOnly>
          <NavHeader />
        </SessionOnly>
        <div id="main-content" className="flex min-h-0 min-w-0 flex-1 flex-col">
          <NativePageTransition>{children}</NativePageTransition>
        </div>
        <SessionOnly>
          <ChatWidget />
        </SessionOnly>
        <PlanLimitPrompt />
        <AiDataNotice />
        {/* Spacer for mobile bottom nav — invisible on sm+ */}
        <div
          className="app-bottom-spacer h-16 shrink-0 sm:hidden print:hidden"
          aria-hidden="true"
        />
      </div>
    </AppIntlProvider>
  );
}
