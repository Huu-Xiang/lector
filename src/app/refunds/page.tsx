import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LegalShell, H2 } from '@/components/LegalLinks/shell';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legalPages');
  return { title: t('refunds.metaTitle'), alternates: { canonical: '/refunds' } };
}

export default async function RefundsPage() {
  const t = await getTranslations('legalPages.refunds');
  const tags = {
    mail: (chunks: React.ReactNode) => (
      <a className="underline" href="mailto:privacy@readfox.app">
        {chunks}
      </a>
    ),
  };
  const rules = ['rule1', 'rule2', 'rule3'] as const;

  return (
    <LegalShell title={t('title')}>
      <p>{t('intro')}</p>

      <H2>{t('rmbHeading')}</H2>
      <p>{t('rmbIntro')}</p>
      <ul className="list-disc space-y-1 pl-5">
        {rules.map((rule) => (
          <li key={rule}>{t(rule)}</li>
        ))}
      </ul>
      <p>{t.rich('how', tags)}</p>
      <p>{t('after')}</p>

      <H2>{t('cardHeading')}</H2>
      <p>{t('cardBody')}</p>

      <H2>{t('abuseHeading')}</H2>
      <p>{t('abuseBody')}</p>

      <H2>{t('contactHeading')}</H2>
      <p>{t.rich('contactBody', tags)}</p>
    </LegalShell>
  );
}
