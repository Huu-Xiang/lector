import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const t = await getTranslations('chrome.notFound');

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <p className="text-sm font-bold tracking-widest text-muted-foreground">404</p>
      <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t('body')}</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t('backToLibrary')}
        </Link>
        <Link
          href="/books"
          className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
        >
          {t('freeBooks')}
        </Link>
      </div>
    </main>
  );
}
