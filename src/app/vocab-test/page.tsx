import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { H2, LegalShell } from '@/components/LegalLinks/shell';
import VocabTest from '@/components/VocabTest';
import ReportResume from '@/components/VocabTest/ReportResume';
import { SITE_ORIGIN } from '@/lib/public-books';
import { loadVocabTestBooks, loadVocabTestData } from '@/lib/vocab-test-data';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('vocabTest');
  const title = `${t('metaTitle')} | Readfox`;
  const description = t('metaDescription');
  return {
    title,
    description,
    alternates: { canonical: '/vocab-test' },
    openGraph: {
      title,
      description,
      url: `${SITE_ORIGIN}/vocab-test`,
      siteName: 'Readfox',
      type: 'website',
    },
  };
}

const FAQ_KEYS = ['how', 'accuracy', 'free', 'level'] as const;

export default async function VocabTestPage() {
  const t = await getTranslations('vocabTest');
  const data = loadVocabTestData();
  if (!data) notFound();
  const faq = FAQ_KEYS.map((key) => ({ q: t(`faq.${key}Q`), a: t(`faq.${key}A`) }));
  const structured = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: t('metaTitle'),
      url: `${SITE_ORIGIN}/vocab-test`,
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
    <LegalShell title={t('title')}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, '\\u003c') }}
      />
      <Suspense fallback={null}>
        <ReportResume />
      </Suspense>
      <VocabTest
        meta={{ bands: data.bands.map(({ from, to }) => ({ from, to })), source: data.source }}
        books={loadVocabTestBooks()}
      />
      <section className="space-y-3 pt-6" data-testid="vocab-faq">
        <H2>{t('faq.title')}</H2>
        {faq.map(({ q, a }) => (
          <div key={q}>
            <h3 className="font-semibold">{q}</h3>
            <p className="text-muted-foreground">{a}</p>
          </div>
        ))}
      </section>
    </LegalShell>
  );
}
