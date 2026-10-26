import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { BookOpen, Languages, Repeat, PenLine, Layers } from 'lucide-react';
import LegalLinks from '@/components/LegalLinks';
import { LANGUAGES } from '@/lib/languages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('landing');
  const title = t('metaTitle');
  const description = t('metaDescription');
  return {
    title,
    description,
    alternates: { canonical: '/landing' },
    openGraph: { title, description, url: '/landing', siteName: 'Readfox', type: 'website' },
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
  const t = await getTranslations('landing');
  const languageCount = Object.keys(LANGUAGES).length;
  return (
    <div className="min-h-screen w-full bg-background">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
        <Link href="/landing" className="flex items-center gap-2" title="Readfox">
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
            <p className="mt-4 text-lg text-muted-foreground">
              {t('heroBody', { count: languageCount })}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/register"
                className="rounded-lg bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:opacity-90"
              >
                {t('createAccount')}
              </Link>
              <Link
                href="/login"
                className="rounded-lg border border-border px-5 py-2.5 font-semibold text-foreground hover:bg-accent"
              >
                {t('signIn')}
              </Link>
            </div>
          </div>
          <Image
            src="/readfox-logo-full.png"
            alt={t('heroAlt')}
            width={480}
            height={480}
            priority
            className="mx-auto w-full max-w-sm rounded-3xl"
          />
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
