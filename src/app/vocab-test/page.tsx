import VocabTestShell, {
  VocabVisitorOnly,
  VocabLanguageTabsVisibility,
} from '@/components/VocabTest/VocabTestShell';
import VocabTestLanguageTabs from '@/components/VocabTest/LanguageTabs';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { H2 } from '@/components/LegalLinks/shell';
import PublicLink from '@/components/PublicLink';
import VocabTest from '@/components/VocabTest';
import ReportResume from '@/components/VocabTest/ReportResume';
import UiLanguageSelect from '@/i18n/UiLanguageSelect';
import { SITE_ORIGIN } from '@/lib/public-books';
import { loadVocabTestBooks, loadVocabTestData } from '@/lib/vocab-test-data';
import { publicAlternatesForRequest } from '@/lib/public-locale.server';
import { buildPublicTwitter, withPublicOg } from '@/lib/site-seo';

export async function generateMetadata(): Promise<Metadata> {
  const [t, { alternates, canonicalUrl }] = await Promise.all([
    getTranslations('vocabTest'),
    publicAlternatesForRequest('/vocab-test'),
  ]);
  const title = `${t('metaTitle')} | Readfox`;
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

const FAQ_KEYS = ['how', 'accuracy', 'free', 'level'] as const;
const BOOK_LINK_LANGUAGES = ['en', 'fr', 'es'] as const;

export default async function VocabTestPage() {
  const [t, locale, { canonicalUrl }] = await Promise.all([
    getTranslations('vocabTest'),
    getLocale(),
    publicAlternatesForRequest('/vocab-test'),
  ]);
  const data = loadVocabTestData(locale === 'ru' ? 'ru' : undefined);
  if (!data) notFound();
  const displayNames = new Intl.DisplayNames([locale], { type: 'language' });
  const faq = FAQ_KEYS.map((key) => ({
    q: t(`faq.${key}Q`),
    a: key === 'how' ? t('intro') : t(`faq.${key}A`),
  }));
  const structured = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: t('metaTitle'),
      url: canonicalUrl,
      inLanguage: locale,
      description: t('metaDescription'),
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      provider: { '@type': 'Organization', name: 'Readfox', url: SITE_ORIGIN },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    },
  ];
  return (
    <VocabTestShell
      title={t('title')}
      visitorTools={<UiLanguageSelect showLabel />}
      showVisitorBack={false}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, '\\u003c') }}
      />
      <Suspense fallback={null}>
        <ReportResume />
      </Suspense>
      <VocabLanguageTabsVisibility>
        <VocabTestLanguageTabs active="en" />
      </VocabLanguageTabsVisibility>
      <VocabTest
        key={locale}
        meta={{
          bands: data.bands.map(({ from, to }) => ({ from, to })),
          source: data.source,
          answerLanguage: data.answerLanguage,
        }}
        books={loadVocabTestBooks()}
      />
      <VocabVisitorOnly>
        <section className="space-y-2 pt-2" data-testid="vocab-ssr-book-links">
          <H2>{t('browseBooksHeading')}</H2>
          <div className="flex flex-wrap gap-2">
            {BOOK_LINK_LANGUAGES.map((code) => (
              <PublicLink
                key={code}
                href={`/books/${code}`}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
              >
                {t('browseBooksFor', { language: displayNames.of(code) ?? code })}
              </PublicLink>
            ))}
          </div>
        </section>
        <section className="space-y-2 pt-4" data-testid="vocab-faq">
          <H2>{t('faq.title')}</H2>
          {faq.map(({ q, a }) => (
            <details key={q} className="border-b border-border">
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">
                {q}
              </summary>
              <p className="max-w-prose pb-4 text-sm leading-relaxed text-muted-foreground">{a}</p>
            </details>
          ))}
        </section>
      </VocabVisitorOnly>
    </VocabTestShell>
  );
}
