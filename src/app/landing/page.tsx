import type { Metadata } from 'next';
import Image from 'next/image';
import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { BookOpen, Languages, Repeat, PenLine, Layers } from 'lucide-react';
import LandingDemo from '@/components/landing-demo/LandingDemo';
import { demoSetForRequest } from '@/components/landing-demo/demo-language';
import JsonLd from '@/components/JsonLd';
import LegalLinks from '@/components/LegalLinks';
import PublicLink from '@/components/PublicLink';
import WelcomeOfferNote from '@/components/WelcomeOfferNote';
import { LANGUAGES, NATIVE_LANGUAGES } from '@/lib/languages';
import { PUBLIC_BOOK_LANGUAGES } from '@/lib/public-books';
import { LOCALE_COOKIE, UI_LOCALES } from '@/i18n/locales';
import { LANDING_ROOT_ID } from '@/lib/api-base';
import NativeAppRedirect from '@/components/NativeAppRedirect';
import LandingReaderDemo from '@/components/LandingReaderDemo';
import { READFOX_LOCALE_HEADER } from '@/lib/public-locale';
import { publicAlternatesForRequest } from '@/lib/public-locale.server';
import {
  buildOrganizationJsonLd,
  buildPublicTwitter,
  buildWebsiteJsonLd,
  withPublicOg,
} from '@/lib/site-seo';

export async function generateMetadata(): Promise<Metadata> {
  const [t, { alternates, canonicalUrl }] = await Promise.all([
    getTranslations('landing'),
    publicAlternatesForRequest('/'),
  ]);
  const title = t('metaTitle');
  const description = t('metaDescription');
  return {
    title,
    description,
    alternates,
    openGraph: withPublicOg({
      title,
      description,
      url: canonicalUrl,
      siteName: 'Readfox',
      type: 'website',
    }),
    twitter: buildPublicTwitter(title, description),
  };
}

const features = [
  { key: 'read', icon: BookOpen },
  { key: 'tap', icon: Languages },
  { key: 'vocab', icon: Layers },
  { key: 'srs', icon: Repeat },
  { key: 'write', icon: PenLine },
] as const;

export default async function LandingPage() {
  const [t, locale, store, requestHeaders, { canonicalUrl }] = await Promise.all([
    getTranslations('landing'),
    getLocale(),
    cookies(),
    headers(),
    publicAlternatesForRequest('/'),
  ]);
  const demo = demoSetForRequest(
    requestHeaders.get(READFOX_LOCALE_HEADER) ?? store.get(LOCALE_COOKIE)?.value,
    requestHeaders.get('accept-language'),
  );
  const names = new Intl.DisplayNames([locale], { type: 'language' });
  // The free-library languages are the ones production opens in setup (SETUP_READY_LANGUAGES).
  const ready = PUBLIC_BOOK_LANGUAGES.map((code) => ({
    code,
    name: names.of(code) ?? code,
  }));
  const soonCount = Object.keys(LANGUAGES).length - PUBLIC_BOOK_LANGUAGES.length;
  const softwareLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Readfox',
    url: canonicalUrl,
    inLanguage: locale,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web, iOS',
    description: t('metaDescription'),
    image: 'https://readfox.app/og.png',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    publisher: { '@id': 'https://readfox.app/#organization' },
  };
  return (
    <div id={LANDING_ROOT_ID} className="min-h-screen w-full bg-background">
      <NativeAppRedirect to="/login" />
      <JsonLd data={softwareLd} />
      <JsonLd data={buildOrganizationJsonLd()} />
      <JsonLd data={buildWebsiteJsonLd(canonicalUrl, locale)} />
      <WelcomeOfferNote variant="bar" />
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:py-5">
        <PublicLink href="/" className="flex shrink-0 items-center gap-2" title="Readfox">
          <Image src="/logo.png" alt="" width={32} height={32} className="shrink-0 rounded" />
          <span className="text-lg font-extrabold tracking-tight text-foreground">Readfox</span>
        </PublicLink>
        <nav className="flex items-center gap-2.5 text-xs sm:gap-4 sm:text-sm">
          <PublicLink
            href="/books"
            className="font-medium whitespace-nowrap text-foreground hover:underline"
          >
            {t('freeBooks')}
          </PublicLink>
          <PublicLink
            href="/pricing"
            className="hidden font-medium whitespace-nowrap text-foreground hover:underline sm:inline"
          >
            {t('pricing')}
          </PublicLink>
          <Link
            href="/login"
            className="font-medium whitespace-nowrap text-foreground hover:underline"
          >
            {t('signIn')}
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-primary px-2.5 py-1.5 font-semibold whitespace-nowrap text-primary-foreground hover:opacity-90 sm:px-3"
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
              <PublicLink
                href="/books"
                className="rounded-lg border border-border px-5 py-2.5 font-semibold text-foreground hover:bg-accent"
              >
                {t('freeBooks')}
              </PublicLink>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              <PublicLink
                href="/vocab-test"
                data-testid="landing-vocab-test-link"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {t('vocabTest')}
              </PublicLink>
            </p>
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
              {ready.map(({ code, name }) => (
                <PublicLink
                  key={code}
                  href={`/books/${code}`}
                  className="rounded-full border border-primary/40 bg-[var(--primary-soft)] px-2.5 py-0.5 text-foreground hover:bg-primary/15"
                >
                  {name}
                </PublicLink>
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
          <LandingReaderDemo />
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
                  <PublicLink href="/privacy" className="underline">
                    {chunks}
                  </PublicLink>
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
