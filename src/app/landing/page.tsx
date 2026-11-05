import type { Metadata } from 'next';
import Image from 'next/image';
import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { BookOpen, Languages, Repeat, PenLine, Layers } from 'lucide-react';
import LandingDemo from '@/components/landing-demo/LandingDemo';
import { demoSetForRequest } from '@/components/landing-demo/demo-language';
import LegalLinks from '@/components/LegalLinks';
import WelcomeOfferNote from '@/components/WelcomeOfferNote';
import { LANGUAGES, NATIVE_LANGUAGES } from '@/lib/languages';
import { PUBLIC_BOOK_LANGUAGES } from '@/lib/public-books';
import { LOCALE_COOKIE, UI_LOCALES } from '@/i18n/locales';
import { LANDING_ROOT_ID } from '@/lib/api-base';
import NativeAppRedirect from '@/components/NativeAppRedirect';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('landing');
  const title = t('metaTitle');
  const description = t('metaDescription');
  return {
    title,
    description,
    alternates: { canonical: '/' },
    openGraph: {
      title,
      description,
      url: '/',
      siteName: 'Readfox',
      type: 'website',
      images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Readfox' }],
    },
    twitter: { card: 'summary_large_image', title, description, images: ['/og.png'] },
  };
}

const SOFTWARE_LD = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Readfox',
  url: 'https://readfox.app/',
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Web',
  description:
    'Read real books in the language you are learning, with instant translations and spaced-repetition practice.',
  image: 'https://readfox.app/og.png',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
};

const features = [
  { key: 'read', icon: BookOpen },
  { key: 'tap', icon: Languages },
  { key: 'vocab', icon: Layers },
  { key: 'srs', icon: Repeat },
  { key: 'write', icon: PenLine },
] as const;

export default async function LandingPage() {
  const t = await getTranslations('landing');
  const locale = await getLocale();
  const [store, requestHeaders] = await Promise.all([cookies(), headers()]);
  const demo = demoSetForRequest(
    store.get(LOCALE_COOKIE)?.value,
    requestHeaders.get('accept-language'),
  );
  const names = new Intl.DisplayNames([locale], { type: 'language' });
  // The free-library languages are the ones production opens in setup (SETUP_READY_LANGUAGES).
  const ready = PUBLIC_BOOK_LANGUAGES.map((code) => names.of(code) ?? code);
  const soonCount = Object.keys(LANGUAGES).length - PUBLIC_BOOK_LANGUAGES.length;
  return (
    <div id={LANDING_ROOT_ID} className="min-h-screen w-full bg-background">
      <NativeAppRedirect to="/login" />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SOFTWARE_LD) }}
      />
      <WelcomeOfferNote variant="bar" />
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
        <Link href="/" className="flex items-center gap-2" title="Readfox">
          <Image src="/logo.png" alt="" width={32} height={32} className="rounded" />
          <span className="text-lg font-extrabold tracking-tight text-foreground">Readfox</span>
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link
            href="/books"
            className="hidden font-medium text-foreground hover:underline sm:inline"
          >
            {t('freeBooks')}
          </Link>
          <Link href="/pricing" className="font-medium text-foreground hover:underline">
            {t('pricing')}
          </Link>
          <Link href="/login" className="font-medium text-foreground hover:underline">
            {t('signIn')}
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-primary px-3 py-1.5 font-semibold text-primary-foreground hover:opacity-90"
          >
            {t('getStarted')}
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-5xl items-center gap-8 px-4 py-10 sm:grid-cols-2 sm:py-16">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              {t('heroTitle')}
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">{t('heroBody')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/register"
                className="rounded-lg bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:opacity-90"
              >
                {t('createAccount')}
              </Link>
              <Link
                href="/books"
                className="rounded-lg border border-border px-5 py-2.5 font-semibold text-foreground hover:bg-accent"
              >
                {t('freeBooks')}
              </Link>
            </div>
          </div>
          <LandingDemo initialSet={demo.id} fromCookie={demo.fromCookie} />
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 pb-4">
          <div
            className="rounded-2xl border border-border bg-card px-5 py-4"
            data-testid="landing-languages"
          >
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-foreground">{t('languagesNow')}</span>
              {ready.map((name) => (
                <span
                  key={name}
                  className="rounded-full border border-primary/40 bg-[var(--primary-soft)] px-2.5 py-0.5 text-foreground"
                >
                  {name}
                </span>
              ))}
              <span className="text-muted-foreground">
                {t('languagesSoon', { count: soonCount })}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t('languagesUi', {
                ui: UI_LOCALES.map((l) => l.native).join(' / '),
                count: NATIVE_LANGUAGES.length,
              })}
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 py-8" aria-labelledby="features">
          <h2 id="features" className="mb-6 text-2xl font-bold tracking-tight text-foreground">
            {t('howTitle')}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ key, icon: Icon }) => (
              <li key={key} className="rounded-2xl border border-border bg-card p-5">
                <Icon className="mb-3 h-6 w-6 text-primary" aria-hidden="true" />
                <h3 className="font-semibold text-foreground">{t(`features.${key}.title`)}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t(`features.${key}.body`)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 py-10">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-xl font-bold tracking-tight text-foreground">{t('openTitle')}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t.rich('openBody', {
                privacy: (chunks) => (
                  <Link href="/privacy" className="underline">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </div>
        </section>
      </main>

      <footer className="px-4 pb-10">
        <LegalLinks />
      </footer>
    </div>
  );
}
