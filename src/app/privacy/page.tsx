import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { LegalShell, H2 } from '@/components/LegalLinks/shell';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legalPages');
  return { title: t('privacy.metaTitle') };
}

const LAST_UPDATED = new Date(Date.UTC(2026, 9, 14));
const STORE_ITEMS = ['account', 'text', 'learning', 'aiKey', 'session'] as const;
const OTHERS_ITEMS = ['cloudflare', 'resend', 'aiProvider'] as const;
const CONTROLS_ITEMS = ['export', 'delete', 'aiKey'] as const;

export default async function PrivacyPage() {
  const t = await getTranslations('legalPages');
  const locale = await getLocale();
  const isEnglish = locale.startsWith('en');
  const date = new Intl.DateTimeFormat(isEnglish ? 'en-GB' : locale, {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(LAST_UPDATED);
  const tags = {
    strong: (chunks: React.ReactNode) => <strong>{chunks}</strong>,
    em: (chunks: React.ReactNode) => <em>{chunks}</em>,
    mail: (chunks: React.ReactNode) => (
      <a className="underline" href="mailto:privacy@readfox.app">
        {chunks}
      </a>
    ),
  };

  return (
    <LegalShell title={t('privacy.title')}>
      {!isEnglish && <p className="text-xs text-muted-foreground">{t('notice')}</p>}
      <p className="text-muted-foreground">{t('privacy.lastUpdated', { date })}</p>
      <p>{t('privacy.intro')}</p>

      <H2>{t('privacy.store.heading')}</H2>
      <ul className="list-disc space-y-1 pl-5">
        {STORE_ITEMS.map((key) => (
          <li key={key}>{t.rich(`privacy.store.items.${key}`, tags)}</li>
        ))}
      </ul>

      <H2>{t('privacy.others.heading')}</H2>
      <ul className="list-disc space-y-1 pl-5">
        {OTHERS_ITEMS.map((key) => (
          <li key={key}>{t.rich(`privacy.others.items.${key}`, tags)}</li>
        ))}
      </ul>
      <p>{t('privacy.others.noTrackers')}</p>

      <H2>{t('privacy.operator.heading')}</H2>
      <p>{t('privacy.operator.dashboard')}</p>
      <p>{t('privacy.operator.access')}</p>

      <H2>{t('privacy.backups.heading')}</H2>
      <p>{t('privacy.backups.body')}</p>

      <H2>{t('privacy.controls.heading')}</H2>
      <ul className="list-disc space-y-1 pl-5">
        {CONTROLS_ITEMS.map((key) => (
          <li key={key}>{t.rich(`privacy.controls.items.${key}`, tags)}</li>
        ))}
      </ul>

      <H2>{t('privacy.children.heading')}</H2>
      <p>{t('privacy.children.body')}</p>

      <H2>{t('privacy.contact.heading')}</H2>
      <p>{t.rich('privacy.contact.body', tags)}</p>
    </LegalShell>
  );
}
