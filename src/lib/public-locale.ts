import type { Metadata } from 'next';

const SITE_ORIGIN = 'https://readfox.app';

export const READFOX_LOCALE_HEADER = 'x-readfox-locale';
export const READFOX_LOCALE_PREFIX_HEADER = 'x-readfox-locale-prefix';

export const PUBLIC_LOCALE_PREFIXES = {
  'zh-cn': 'zh-CN',
  'zh-tw': 'zh-TW',
  ja: 'ja',
  ko: 'ko',
  ru: 'ru',
} as const;

export type PublicLocalePrefixSlug = keyof typeof PUBLIC_LOCALE_PREFIXES;
export type PublicPrefixedLocale = (typeof PUBLIC_LOCALE_PREFIXES)[PublicLocalePrefixSlug];

const LOCALE_TO_PREFIX: Record<string, string> = {
  en: '',
  'zh-CN': '/zh-cn',
  'zh-TW': '/zh-tw',
  ja: '/ja',
  ko: '/ko',
  ru: '/ru',
};

const PUBLIC_SEO_EXACT = new Set([
  '/',
  '/pricing',
  '/privacy',
  '/terms',
  '/refunds',
  '/about',
  '/books',
  '/vocab-test',
  '/alternatives',
]);

const PUBLIC_SEO_PREFIXES = ['/books/', '/alternatives/'] as const;

const VOCAB_TEST_LANG_RE = /^\/vocab-test\/(en|fr|es)$/;

export function isPublicSeoPath(pathname: string): boolean {
  if (PUBLIC_SEO_EXACT.has(pathname)) return true;
  if (VOCAB_TEST_LANG_RE.test(pathname)) return true;
  return PUBLIC_SEO_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export interface ParsedPublicLocalePath {
  prefix: string;
  locale: PublicPrefixedLocale;
  publicPath: string;
  rewritePath: string;
}

export function parsePublicLocalePath(pathname: string): ParsedPublicLocalePath | null {
  if (!pathname.startsWith('/')) return null;
  const trimmed = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const secondSlash = trimmed.indexOf('/', 1);
  const firstSegment = (
    secondSlash === -1 ? trimmed.slice(1) : trimmed.slice(1, secondSlash)
  ).toLowerCase();
  if (!(firstSegment in PUBLIC_LOCALE_PREFIXES)) return null;

  const locale = PUBLIC_LOCALE_PREFIXES[firstSegment as PublicLocalePrefixSlug];
  const rest = secondSlash === -1 ? '/' : trimmed.slice(secondSlash);
  if (!isPublicSeoPath(rest)) return null;

  return {
    prefix: `/${firstSegment}`,
    locale,
    publicPath: rest,
    rewritePath: rest === '/' ? '/landing' : rest,
  };
}

export function stripPublicLocalePrefix(pathname: string): string {
  const parsed = parsePublicLocalePath(pathname);
  return parsed ? parsed.publicPath : pathname;
}

export function publicLocalePrefixFromPath(pathname: string | null | undefined): string {
  if (!pathname) return '';
  return parsePublicLocalePath(pathname)?.prefix ?? '';
}

export function publicPrefixForLocale(locale: string): string {
  if (!locale) return '';
  if (locale in LOCALE_TO_PREFIX) return LOCALE_TO_PREFIX[locale];
  if (locale.startsWith('/')) {
    const slug = locale.slice(1).toLowerCase();
    if (slug in PUBLIC_LOCALE_PREFIXES) return `/${slug}`;
  }
  return '';
}

export function localizePublicPath(pathname: string, locale: string): string {
  const match = /^([^?#]*)(.*)$/.exec(pathname);
  const rawPath = match ? match[1] : pathname;
  const suffix = match ? match[2] : '';
  const basePath = stripPublicLocalePrefix(rawPath);
  if (!isPublicSeoPath(basePath)) return pathname;
  const prefix = publicPrefixForLocale(locale);
  const localized = !prefix ? basePath : basePath === '/' ? prefix : `${prefix}${basePath}`;
  return `${localized}${suffix}`;
}

export function publicUrl(canonicalPath: string, prefix = ''): string {
  const normalized = canonicalPath === '/' ? '' : canonicalPath;
  if (!prefix) return `${SITE_ORIGIN}${normalized}`;
  return `${SITE_ORIGIN}${prefix}${normalized}`;
}

export function sitemapLanguages(canonicalPath: string): Record<string, string> {
  const languages: Record<string, string> = {
    en: publicUrl(canonicalPath, ''),
  };
  for (const [slug, locale] of Object.entries(PUBLIC_LOCALE_PREFIXES)) {
    languages[locale] = publicUrl(canonicalPath, `/${slug}`);
  }
  languages['x-default'] = publicUrl(canonicalPath, '');
  return languages;
}

export function buildPublicAlternates(
  canonicalPath: string,
  activePrefix = '',
): NonNullable<Metadata['alternates']> {
  const canonical = publicUrl(canonicalPath, activePrefix);
  return {
    canonical,
    languages: sitemapLanguages(canonicalPath),
  };
}
