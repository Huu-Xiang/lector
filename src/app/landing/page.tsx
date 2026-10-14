import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { BookOpen, Languages, Repeat, PenLine, Layers } from 'lucide-react';
import LegalLinks, { SOURCE_URL } from '@/components/LegalLinks';
import { LANGUAGES } from '@/lib/languages';

const title = 'Readfox – read real books in the language you are learning';
const description =
  'Import a book or paste any text, tap a word for an instant translation, and turn what you read into spaced-repetition practice. Free and open source.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/landing' },
  openGraph: { title, description, url: '/landing', siteName: 'Readfox', type: 'website' },
};

const features = [
  {
    icon: BookOpen,
    title: 'Read what you love',
    body: 'Import an EPUB or paste any text. Your own books become your lessons.',
  },
  {
    icon: Languages,
    title: 'Tap a word, understand it',
    body: 'Instant translations and explanations in context, powered by the AI key you choose.',
  },
  {
    icon: Layers,
    title: 'Your vocabulary builds itself',
    body: 'Every word you look up is saved with the sentence you found it in.',
  },
  {
    icon: Repeat,
    title: 'Spaced-repetition practice',
    body: 'Review words at the right moment so they actually stick.',
  },
  {
    icon: PenLine,
    title: 'Write and get feedback',
    body: 'Keep a journal in your target language and have it corrected.',
  },
];

export default function LandingPage() {
  const languageCount = Object.keys(LANGUAGES).length;
  return (
    <div className="min-h-screen w-full bg-background">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
        <Link href="/landing" className="flex items-center gap-2" title="Readfox">
          <Image src="/logo.png" alt="" width={32} height={32} className="rounded" />
          <span className="text-lg font-extrabold tracking-tight text-foreground">Readfox</span>
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-primary px-3 py-1.5 font-semibold text-primary-foreground hover:opacity-90"
          >
            Get started free
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-5xl items-center gap-8 px-4 py-10 sm:grid-cols-2 sm:py-16">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Read real books in the language you are learning
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Readfox turns reading into learning. Tap any word for a translation, collect
              vocabulary as you go, and practise it with spaced repetition. {languageCount}{' '}
              languages, free to use.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/register"
                className="rounded-lg bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:opacity-90"
              >
                Create a free account
              </Link>
              <Link
                href="/login"
                className="rounded-lg border border-border px-5 py-2.5 font-semibold text-foreground hover:bg-accent"
              >
                Sign in
              </Link>
            </div>
          </div>
          <Image
            src="/readfox-logo-full.png"
            alt="Readfox: a fox resting on an open book"
            width={480}
            height={480}
            priority
            className="mx-auto w-full max-w-sm rounded-3xl"
          />
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 py-8" aria-labelledby="features">
          <h2 id="features" className="mb-6 text-2xl font-bold tracking-tight text-foreground">
            How it works
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title: t, body }) => (
              <li key={t} className="rounded-2xl border border-border bg-card p-5">
                <Icon className="mb-3 h-6 w-6 text-primary" aria-hidden="true" />
                <h3 className="font-semibold text-foreground">{t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 py-10">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Open source, and your reading stays yours
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Readfox is free software (AGPL-3.0) based on Lector. AI features use your own
              OpenRouter or Anthropic key, so you control the cost. We do not run advertising or
              analytics trackers. Read the{' '}
              <Link href="/privacy" className="underline">
                privacy policy
              </Link>{' '}
              or{' '}
              <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className="underline">
                browse the source code
              </a>
              .
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
