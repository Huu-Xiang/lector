import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LegalShell } from '@/components/LegalLinks/shell';
import ReportHistory from '@/components/VocabTest/ReportHistory';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('vocabTest.report');
  return { title: `${t('history')} | Readfox`, robots: { index: false, follow: false } };
}

export default async function VocabReportHistoryPage() {
  const t = await getTranslations('vocabTest.report');
  return (
    <LegalShell title={t('history')}>
      <ReportHistory />
    </LegalShell>
  );
}
