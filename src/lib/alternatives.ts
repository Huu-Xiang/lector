import { SITE_ORIGIN } from './public-books';

export const ALTERNATIVE_COMPETITORS = ['lingq', 'readlang'] as const;

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

export const COMPETITOR_FAQ_KEYS: Record<AlternativeCompetitor, readonly string[]> = {
  lingq: ['import', 'free', 'books', 'differences'],
  readlang: ['free', 'books', 'review', 'differences'],
};

export function isAlternativeCompetitor(value: string): value is AlternativeCompetitor {
  return (ALTERNATIVE_COMPETITORS as readonly string[]).includes(value);
}

export function alternativePath(competitor: AlternativeCompetitor): string {
  return `/alternatives/${competitor}`;
}

export function alternativeJsonLd({
  competitor,
  url,
  title,
  description,
  allLabel,
  faq,
}: {
  competitor: AlternativeCompetitor;
  url: string;
  title: string;
  description: string;
  allLabel: string;
  faq: Array<{ q: string; a: string }>;
}): Array<Record<string, unknown>> {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Readfox',
      url,
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web',
      description,
      image: `${SITE_ORIGIN}/og.png`,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      isSimilarTo: {
        '@type': 'SoftwareApplication',
        name: competitor === 'lingq' ? 'LingQ' : 'Readlang',
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
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: allLabel, item: `${SITE_ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: title, item: url },
      ],
    },
  ];
}
