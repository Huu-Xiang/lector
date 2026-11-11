import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LegalShell } from '@/components/LegalLinks/shell';
import VocabTest from '@/components/VocabTest';
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

export default async function VocabTestPage() {
  const t = await getTranslations('vocabTest');
  const data = loadVocabTestData();
  if (!data) notFound();
  return (
    <LegalShell title={t('title')}>
      <VocabTest data={data} books={loadVocabTestBooks()} />
    </LegalShell>
  );
}
