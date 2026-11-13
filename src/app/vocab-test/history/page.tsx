import VocabTestShell from '@/components/VocabTest/VocabTestShell';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import ReportHistory from '@/components/VocabTest/ReportHistory';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('vocabTest.report');
  return { title: `${t('history')} | Readfox`, robots: { index: false, follow: false } };
}

export default async function VocabReportHistoryPage() {
  const t = await getTranslations('vocabTest.report');
  return (
    <VocabTestShell title={t('history')}>
      <ReportHistory />
    </VocabTestShell>
  );
}
