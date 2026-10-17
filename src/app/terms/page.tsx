import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { LegalShell, H2 } from '@/components/LegalLinks/shell';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legalPages');
  return { title: t('terms.metaTitle') };
}

const LAST_UPDATED = new Date(Date.UTC(2026, 9, 17));

export default async function TermsPage() {
  const t = await getTranslations('legalPages');
  const locale = await getLocale();
  const isEnglish = locale.startsWith('en');
  const date = new Intl.DateTimeFormat(isEnglish ? 'en-GB' : locale, {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(LAST_UPDATED);
  const tags = {
    refund: (chunks: React.ReactNode) => (
      <a className="underline" href="/refunds">
        {chunks}
      </a>
    ),
    mail: (chunks: React.ReactNode) => (
      <a className="underline" href="mailto:privacy@readfox.app">
        {chunks}
      </a>
    ),
  };

  return (
    <LegalShell title={t('terms.title')}>
      {!isEnglish && <p className="text-xs text-muted-foreground">{t('notice')}</p>}
      <p className="text-muted-foreground">{t('terms.lastUpdated', { date })}</p>
      <p>{t('terms.intro')}</p>

      <H2>{t('terms.content.heading')}</H2>
      <p>{t('terms.content.body')}</p>

      <H2>{t('terms.limits.heading')}</H2>
      <p>{t('terms.limits.body')}</p>

      <H2>{t('terms.payments.heading')}</H2>
      <p>{t('terms.payments.body')}</p>
      <p>{t('terms.payments.renewal')}</p>
      <p>{t.rich('terms.payments.rmb', tags)}</p>
      <p>{t.rich('terms.payments.refunds', tags)}</p>

      <H2>{t('terms.acceptableUse.heading')}</H2>
      <p>{t('terms.acceptableUse.body')}</p>

      <H2>{t('terms.warranty.heading')}</H2>
      <p>{t('terms.warranty.body')}</p>

      <H2>{t('terms.termination.heading')}</H2>
      <p>{t('terms.termination.body')}</p>

      <H2>{t('terms.openSource.heading')}</H2>
      <p>{t('terms.openSource.body')}</p>
      <p>{t.rich('terms.openSource.contact', tags)}</p>
    </LegalShell>
  );
}
