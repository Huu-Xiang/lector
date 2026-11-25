import type { Metadata } from 'next';

const INDEXNOW_KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

export const DEFAULT_OG_IMAGE = {
  url: '/og.png',
  width: 1200,
  height: 630,
  alt: 'Readfox',
} as const;

export function withPublicOg(
  openGraph: NonNullable<Metadata['openGraph']>,
  customImage?: { url: string; width?: number; height?: number; alt?: string } | null,
): NonNullable<Metadata['openGraph']> {
  return {
    ...openGraph,
    images: customImage ? [customImage] : [DEFAULT_OG_IMAGE],
  };
}

export function buildPublicTwitter(
  title: string,
  description: string,
  imageUrl?: string | null,
): NonNullable<Metadata['twitter']> {
  return {
    card: 'summary_large_image',
    title,
    description,
    images: [imageUrl || DEFAULT_OG_IMAGE.url],
  };
}

export function buildOrganizationJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': 'https://readfox.app/#organization',
    name: 'Readfox',
    url: 'https://readfox.app',
    logo: 'https://readfox.app/icon.png',
    sameAs: ['https://github.com/Huu-Xiang/lector'],
  };
}

export function buildWebsiteJsonLd(
  canonicalUrl: string,
  inLanguage: string,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': 'https://readfox.app/#website',
    name: 'Readfox',
    url: canonicalUrl,
    inLanguage,
    publisher: { '@id': 'https://readfox.app/#organization' },
  };
}

export function isNoIndexSite(): boolean {
  return process.env.READFOX_BETA_NOTICE === '1' || process.env.READFOX_NOINDEX === '1';
}

export function validIndexNowKey(
  raw: string | undefined = process.env.INDEXNOW_KEY,
): string | null {
  const key = raw?.trim() ?? '';
  return INDEXNOW_KEY_PATTERN.test(key) ? key : null;
}

export function siteLastModified(): Date {
  const raw = process.env.NEXT_PUBLIC_BUILD_TIME;
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date('2026-11-24T00:00:00Z');
}
