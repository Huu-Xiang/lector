import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { READFOX_LOCALE_PREFIX_HEADER, buildPublicAlternates, publicUrl } from './public-locale';

export async function activePublicLocalePrefix(): Promise<string> {
  const requestHeaders = await headers();
  return requestHeaders.get(READFOX_LOCALE_PREFIX_HEADER) ?? '';
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
