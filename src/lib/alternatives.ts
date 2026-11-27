import { SITE_ORIGIN } from './public-books';
import { publicUrl } from './public-locale';

export const CORE_ALTERNATIVE_COMPETITORS = ['lingq', 'readlang'] as const;
export type CoreAlternativeCompetitor = (typeof CORE_ALTERNATIVE_COMPETITORS)[number];

export const WAVE3_ALTERNATIVE_COMPETITORS = [
  'lute',
  'duolingo',
  'lingq-for-japanese',
  'lingq-for-korean',
  'lingq-for-french',
] as const;
export type Wave3AlternativeCompetitor = (typeof WAVE3_ALTERNATIVE_COMPETITORS)[number];

export const ALTERNATIVE_COMPETITORS = [
  ...CORE_ALTERNATIVE_COMPETITORS,
  ...WAVE3_ALTERNATIVE_COMPETITORS,
] as const;

export type AlternativeCompetitor = (typeof ALTERNATIVE_COMPETITORS)[number];

export const COMPARISON_ROWS = [
  'price',
  'freeLibrary',
  'lookup',
  'review',
  'audio',
  'import',
  'offline',
  'openSource',
] as const;

export type ComparisonRowKey = (typeof COMPARISON_ROWS)[number];

export const COMPETITOR_DISPLAY_NAMES: Record<AlternativeCompetitor, string> = {
  lingq: 'LingQ',
  readlang: 'Readlang',
  lute: 'Lute',
  duolingo: 'Duolingo',
  'lingq-for-japanese': 'LingQ (Japanese)',
  'lingq-for-korean': 'LingQ (Korean)',
  'lingq-for-french': 'LingQ (French)',
};

export const COMPETITOR_SCHEMA_NAMES: Record<AlternativeCompetitor, string> = {
  lingq: 'LingQ',
  readlang: 'Readlang',
  lute: 'Lute',
  duolingo: 'Duolingo',
  'lingq-for-japanese': 'LingQ',
  'lingq-for-korean': 'LingQ',
  'lingq-for-french': 'LingQ',
};

export const COMPETITOR_FAQ_KEYS: Record<CoreAlternativeCompetitor, readonly string[]> = {
  lingq: ['import', 'free', 'books', 'differences'],
  readlang: ['free', 'books', 'review', 'differences'],
};

export function isAlternativeCompetitor(value: string): value is AlternativeCompetitor {
  return (ALTERNATIVE_COMPETITORS as readonly string[]).includes(value);
}

export function isWave3AlternativeCompetitor(
  value: AlternativeCompetitor,
): value is Wave3AlternativeCompetitor {
  return (WAVE3_ALTERNATIVE_COMPETITORS as readonly string[]).includes(value);
}

export function isLingqVariant(competitor: AlternativeCompetitor): boolean {
  return competitor === 'lingq' || competitor.startsWith('lingq-for-');
}

export function alternativePath(competitor: AlternativeCompetitor): string {
  return `/alternatives/${competitor}`;
}

export function relatedAlternatives(competitor: AlternativeCompetitor): AlternativeCompetitor[] {
  const map: Record<AlternativeCompetitor, AlternativeCompetitor[]> = {
    lingq: ['readlang', 'lingq-for-french', 'lingq-for-korean'],
    readlang: ['lingq', 'lute', 'duolingo'],
    lute: ['lingq', 'readlang', 'lingq-for-japanese'],
    duolingo: ['lingq', 'readlang', 'lingq-for-french'],
    'lingq-for-japanese': ['lingq', 'lute', 'lingq-for-korean'],
    'lingq-for-korean': ['lingq', 'lingq-for-japanese', 'readlang'],
    'lingq-for-french': ['lingq', 'duolingo', 'readlang'],
  };
  return map[competitor];
}

export function alternativeJsonLd({
  competitor,
  url,
  title,
  description,
  allLabel,
  hubLabel,
  localePrefix = '',
  inLanguage,
  faq,
}: {
  competitor: AlternativeCompetitor;
  url: string;
  title: string;
  description: string;
  allLabel: string;
  hubLabel?: string;
  localePrefix?: string;
  inLanguage?: string;
  faq: Array<{ q: string; a: string }>;
}): Array<Record<string, unknown>> {
  const homeUrl = publicUrl('/', localePrefix);
  const breadcrumbItems: Array<Record<string, unknown>> = [
    { '@type': 'ListItem', position: 1, name: allLabel, item: homeUrl },
  ];
  if (hubLabel) {
    breadcrumbItems.push({
      '@type': 'ListItem',
      position: 2,
      name: hubLabel,
      item: publicUrl('/alternatives', localePrefix),
    });
  }
  breadcrumbItems.push({
    '@type': 'ListItem',
    position: breadcrumbItems.length + 1,
    name: title,
    item: url,
  });

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Readfox',
      url,
      ...(inLanguage ? { inLanguage } : {}),
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web, iOS',
      description,
      image: `${SITE_ORIGIN}/og.png`,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      isSimilarTo: {
        '@type': 'SoftwareApplication',
        name: COMPETITOR_SCHEMA_NAMES[competitor],
      },
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
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbItems,
    },
  ];
}

export function alternativesHubJsonLd({
  url,
  title,
  description,
  homeLabel,
  hubLabel,
  localePrefix = '',
  inLanguage,
  items,
}: {
  url: string;
  title: string;
  description: string;
  homeLabel: string;
  hubLabel: string;
  localePrefix?: string;
  inLanguage?: string;
  items: Array<{ name: string; url: string; description: string }>;
}): Array<Record<string, unknown>> {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: title,
      url,
      description,
      ...(inLanguage ? { inLanguage } : {}),
      isPartOf: { '@id': 'https://readfox.app/#website' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: title,
      itemListElement: items.map((item, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        name: item.name,
        url: item.url,
        description: item.description,
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: homeLabel, item: publicUrl('/', localePrefix) },
        { '@type': 'ListItem', position: 2, name: hubLabel, item: url },
      ],
    },
  ];
}
