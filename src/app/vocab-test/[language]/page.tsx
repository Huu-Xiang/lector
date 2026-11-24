import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import VocabTestShell from '@/components/VocabTest/VocabTestShell';
import VocabTestLanguageTabs from '@/components/VocabTest/LanguageTabs';
import VocabTest from '@/components/VocabTest';
import { H2 } from '@/components/LegalLinks/shell';
import UiLanguageSelect from '@/i18n/UiLanguageSelect';
import { SITE_ORIGIN } from '@/lib/public-books';
import { activePublicLocalePrefix, publicAlternatesForRequest } from '@/lib/public-locale.server';
import {
  loadVocabTestBooks,
  loadVocabTestData,
  type VocabTestLanguage,
} from '@/lib/vocab-test-data';

interface Props {
  params: Promise<{ language: string }>;
}

const FAQ_KEYS = ['how', 'accuracy', 'free', 'level'] as const;

export function generateStaticParams() {
  return [{ language: 'fr' }, { language: 'es' }];
}

async function resolveTarget(raw: string): Promise<Exclude<VocabTestLanguage, 'en'>> {
  if (raw === 'en') {
    const prefix = await activePublicLocalePrefix();
    permanentRedirect(prefix ? `${prefix}/vocab-test` : '/vocab-test');
  }
  if (raw === 'fr' || raw === 'es') return raw;
  notFound();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { language: raw } = await params;
  const language = await resolveTarget(raw);
  const [t, locale, { alternates, canonicalUrl }] = await Promise.all([
    getTranslations('vocabTest'),
    getLocale(),
    publicAlternatesForRequest(`/vocab-test/${language}`),
  ]);
  const languageName =
    new Intl.DisplayNames([locale], { type: 'language' }).of(language) ?? language;
  const title = `${t('langMetaTitle', { language: languageName })} | Readfox`;
  const description = t('langMetaDescription', { language: languageName });
  return {
    title,
    description,
    alternates,
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'Readfox',
      type: 'website',
    },
  };
}

export default async function LanguageVocabTestPage({ params }: Props) {
  const { language: raw } = await params;
  const language = await resolveTarget(raw);
  const [t, locale, { canonicalUrl }] = await Promise.all([
    getTranslations('vocabTest'),
    getLocale(),
    publicAlternatesForRequest(`/vocab-test/${language}`),
  ]);
  const data = loadVocabTestData('en', language);
  if (!data) notFound();
  const languageName =
    new Intl.DisplayNames([locale], { type: 'language' }).of(language) ?? language;

  const faq = FAQ_KEYS.map((key) => ({
    q: t(`faq.${key}Q`),
    a:
      key === 'how'
        ? t('langIntroLead', { language: languageName })
        : key === 'free'
          ? t('faq.langFreeA')
          : t(`faq.${key}A`),
  }));

  const structured = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: t('langMetaTitle', { language: languageName }),
      url: canonicalUrl,
      description: t('langMetaDescription', { language: languageName }),
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
      title={t('langTitle', { language: languageName })}
      visitorTools={<UiLanguageSelect showLabel />}
      showVisitorBack={false}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, '\\u003c') }}
      />
      <VocabTestLanguageTabs active={language} />
      <VocabTest
        key={`${language}:${locale}`}
        targetLanguage={language}
        wordsUrl={`/vocab-test/${language}/words`}
        meta={{
          bands: data.bands.map(({ from, to }) => ({ from, to })),
          source: data.source,
          answerLanguage: 'en',
        }}
        books={loadVocabTestBooks(language)}
      />
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
    </VocabTestShell>
  );
}
