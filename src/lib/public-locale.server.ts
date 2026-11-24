import type { Metadata } from 'next';
import { headers } from 'next/headers';
import {
  PUBLIC_LOCALE_PREFIXES,
  READFOX_LOCALE_PREFIX_HEADER,
  buildPublicAlternates,
  publicUrl,
} from './public-locale';

const VALID_PREFIXES = new Set(Object.keys(PUBLIC_LOCALE_PREFIXES).map((slug) => `/${slug}`));

export async function activePublicLocalePrefix(): Promise<string> {
  const requestHeaders = await headers();
  const raw = requestHeaders.get(READFOX_LOCALE_PREFIX_HEADER) ?? '';
  return VALID_PREFIXES.has(raw) ? raw : '';
}

export async function publicAlternatesForRequest(canonicalPath: string): Promise<{
  alternates: NonNullable<Metadata['alternates']>;
  canonicalUrl: string;
}> {
  const prefix = await activePublicLocalePrefix();
  return {
    alternates: buildPublicAlternates(canonicalPath, prefix),
    canonicalUrl: publicUrl(canonicalPath, prefix),
  };
}
