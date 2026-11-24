import type { Metadata, Viewport } from 'next';
import {
  Nunito,
  Literata,
  Noto_Sans_SC,
  Noto_Sans_TC,
  Noto_Sans_JP,
  Noto_Sans_KR,
} from 'next/font/google';
import Script from 'next/script';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { Toaster } from 'sonner';
import AuthGuard from '@/components/AuthGuard';
import BillingGuard from '@/components/BillingGuard';
import SetupGuard from '@/components/SetupGuard';
import TimezoneSync from '@/components/TimezoneSync';
import SourceBeacon from '@/components/SourceBeacon';
import './globals.css';
import NativeBridge from '@/components/NativeBridge';
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar';
import { isRtl } from '@/i18n/locales';
import { pickMessages, SHELL_AND_PUBLIC_NAMESPACES, type MessageTree } from '@/i18n/namespaces';

// Nunito is the UI/chrome font; Literata stays the reading body (issue #147 §2.1).
// Script subsets beyond Latin are #289 Phase 1.1: Literata ships Cyrillic and
// Greek incl. polytonic (greek-ext), so ru/grc reading is a config flag — the
// files are served per-subset with unicode-range, so browsers only fetch the
// slices a page actually uses. Nunito has no Greek; UI chrome is English, so
// cyrillic alone covers the odd target-language string in the chrome.
const nunito = Nunito({
  variable: '--font-nunito',
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '600', '700', '800'],
});

const literata = Literata({
  variable: '--font-literata',
  subsets: ['latin', 'latin-ext', 'cyrillic', 'greek', 'greek-ext'],
});

const chinese = Noto_Sans_SC({
  variable: '--font-cjk-sc',
  preload: false,
  adjustFontFallback: false,
});
const traditional = Noto_Sans_TC({
  variable: '--font-cjk-tc',
  preload: false,
  adjustFontFallback: false,
});
const japanese = Noto_Sans_JP({
  variable: '--font-cjk-jp',
  preload: false,
  adjustFontFallback: false,
});
const korean = Noto_Sans_KR({
  variable: '--font-cjk-kr',
  preload: false,
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  metadataBase: new URL('https://readfox.app'),
  title: 'Readfox',
  description:
    'Read real books in the language you are learning, with instant translations and spaced-repetition practice',
  appleWebApp: { capable: true, title: 'Readfox', statusBarStyle: 'default' },
  openGraph: {
    siteName: 'Readfox',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Readfox' }],
  },
  twitter: { card: 'summary_large_image', images: ['/og.png'] },
};

export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3eee3' },
    { media: '(prefers-color-scheme: dark)', color: '#17140f' },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [locale, fullMessages] = await Promise.all([getLocale(), getMessages()]);
  const publicMessages = pickMessages(fullMessages as MessageTree, SHELL_AND_PUBLIC_NAMESPACES);
  const beta = process.env.READFOX_BETA_NOTICE === '1';
  const t = beta ? await getTranslations('betaNotice') : null;
  return (
    <html lang={locale} dir={isRtl(locale) ? 'rtl' : 'ltr'} suppressHydrationWarning>
      <head>
        {/* Runtime browser config: docker-entrypoint.sh writes /__env.js from
            the container's env (API_URL, LECTOR_MODE); the client reads it as
            window.__ENV__ (src/lib/api-base.ts). NEXT_PUBLIC_* can't carry
            these — it bakes at build, so it can't be set per-deployment on a
            prebuilt image. beforeInteractive so it's set before any fetch. */}
        <Script id="lector-env" src="/__env.js" strategy="beforeInteractive" />
        {/* Runs before paint to migrate legacy localStorage keys and apply the
            saved theme, preventing a flash of the wrong colour scheme. Uses
            next/script (beforeInteractive) rather than a raw <script> so React
            19 doesn't warn about a script tag inside the component tree. */}
        <Script id="lector-theme-init" strategy="beforeInteractive">
          {`(function(){if(!localStorage.getItem('lector-migrated')){var m={'afrikaans-reader-api-key':'lector-api-key','afrikaans-reader-google-api-key':'lector-google-api-key','afrikaans-reader-anki-deck':'lector-anki-deck','afrikaans-reader-anki-cloze-deck':'lector-anki-cloze-deck','afrikaans-reader-card-type':'lector-card-type','afrikaans-reader-tts-speed':'lector-tts-speed','afrikaans-reader-theme':'lector-theme','afrikaans-reader-tts-voice':'lector-tts-voice','afrikaans-reader-tts-mode':'lector-tts-mode'};for(var k in m){var v=localStorage.getItem(k);if(v!==null){localStorage.setItem(m[k],v);localStorage.removeItem(k)}}localStorage.setItem('lector-migrated','1')}var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme:dark)').matches);if(d)document.documentElement.classList.add('dark')})()`}
        </Script>
        {/* Marks the iPhone app before paint so the native styles apply without a flash.
            The shell's bridge is injected at document start, so the plugin check works here. */}
        <Script id="readfox-native-init" strategy="beforeInteractive">
          {`(function(){var c=window.Capacitor;if(navigator.userAgent.indexOf('ReadfoxApp/')<0&&!(c&&c.isNativePlatform&&c.isNativePlatform()))return;var r=document.documentElement;r.setAttribute('data-native-app','');if(c&&c.isPluginAvailable&&c.isPluginAvailable('NativeTabBar'))r.setAttribute('data-native-tabbar','')})()`}
        </Script>
        {/* Chrome fires beforeinstallprompt once, often before Settings mounts;
            src/lib/pwa.ts reads the saved event. */}
        <Script id="readfox-install-prompt" strategy="beforeInteractive">
          {`window.addEventListener('beforeinstallprompt',function(e){window.__installPrompt=e;window.dispatchEvent(new Event('readfox:installprompt'))})`}
        </Script>
      </head>

      <body
        className={`${nunito.variable} ${literata.variable} ${chinese.variable} ${traditional.variable} ${japanese.variable} ${korean.variable} flex min-h-dvh flex-col bg-background font-sans text-foreground antialiased`}
      >
        <NextIntlClientProvider locale={locale} messages={publicMessages}>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {t && (
              <aside
                data-testid="readfox-beta-notice"
                className="readfox-beta-notice shrink-0 border-b border-border bg-primary/10 px-4 py-2.5 text-center text-sm leading-snug text-foreground print:hidden"
              >
                <strong className="mr-2 font-bold">Beta</strong>
                <span className="readfox-beta-message">{t('message')} </span>
                <a
                  href="https://readfox.app"
                  className="inline-flex min-h-6 items-center font-semibold underline underline-offset-4"
                >
                  {t('productionLink')}
                </a>
              </aside>
            )}
            {/* AuthGuard outside SetupGuard: in cloud mode the session must
              resolve before SetupGuard's settings probe (which would 401
              unauthenticated). Selfhost passes straight through (#218).
              BillingGuard between them (#224): session first, then the
              subscription check, and only then anything that fires gated
              API calls. */}
            <AuthGuard>
              <BillingGuard>
                <TimezoneSync />
                <SetupGuard>{children}</SetupGuard>
              </BillingGuard>
            </AuthGuard>
          </div>
          <SourceBeacon />
          <NativeBridge />
          <ServiceWorkerRegistrar />
          {/* Move Sonner's focus hotkey off its Alt+T default — Alt+T toggles the
            translation on the Practice page. */}
          <Toaster
            theme="system"
            duration={5000}
            hotkey={['altKey', 'KeyN']}
            mobileOffset={{
              bottom: 'calc(var(--app-bottom-bar, 0px) + 12px)',
              top: 'calc(env(safe-area-inset-top) + 12px)',
            }}
          />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
