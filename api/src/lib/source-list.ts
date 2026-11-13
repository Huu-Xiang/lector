/** SOURCES and LANGS are mirrored by src/lib/traffic-source.ts; a test keeps the lists equal. */
export const SOURCES = [
  'google',
  'bing',
  'baidu',
  'duckduckgo',
  'yandex',
  'sogou',
  'so360',
  'yahoo',
  'naver',
  'ecosia',
  'brave',
  'chatgpt',
  'perplexity',
  'claude',
  'gemini',
  'copilot',
  'deepseek',
  'kimi',
  'doubao',
  'xiaohongshu',
  'zhihu',
  'weibo',
  'douban',
  'bilibili',
  'v2ex',
  'appinn',
  'sspai',
  'juejin',
  'wechat',
  'reddit',
  'x',
  'facebook',
  'instagram',
  'linkedin',
  'youtube',
  'github',
  'hackernews',
  'producthunt',
  'telegram',
  'discord',
  'email',
  'campaign',
  'other',
  'direct',
] as const;
export type Source = (typeof SOURCES)[number];

export const LANGS = [
  'zh',
  'en',
  'ja',
  'ko',
  'ar',
  'ru',
  'fr',
  'es',
  'de',
  'pt',
  'it',
  'tr',
  'vi',
  'id',
  'th',
  'hi',
  'other',
] as const;
export type Lang = (typeof LANGS)[number];

export const EVENTS = ['visit', 'signup'] as const;
export type SourceEvent = (typeof EVENTS)[number];

export const SOURCE_COOKIE = 'rf_src';
export const PRODUCT_CAMPAIGNS = [
  'launch',
  'newsletter',
  'reading-list',
  'vocab-test',
  'beta',
  'welcome',
  'other',
] as const;
type ProductCampaign = (typeof PRODUCT_CAMPAIGNS)[number];

// Keep the API independent of Next.js files. A parity test uses src/i18n/ui-locales.json.
export const PRODUCT_UI_LANGUAGES = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'ru'] as const;

export function isSource(value: unknown): value is Source {
  return typeof value === 'string' && (SOURCES as readonly string[]).includes(value);
}

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}

export function isProductCampaign(value: unknown): value is ProductCampaign {
  return typeof value === 'string' && (PRODUCT_CAMPAIGNS as readonly string[]).includes(value);
}

function isProductUiLanguage(value: unknown): value is string {
  return typeof value === 'string' && (PRODUCT_UI_LANGUAGES as readonly string[]).includes(value);
}

function readCookie(header: string | null | undefined, name: string): string | undefined {
  const prefix = `${name}=`;
  return header
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

/** Reads `rf_src=<source>.<lang>` from a Cookie header; null when absent or not on the closed lists. */
export function parseSourceCookie(header: string | null | undefined): [Source, Lang] | null {
  const [source, lang, extra] = readCookie(header, SOURCE_COOKIE)?.split('.') ?? [];
  return extra === undefined && isSource(source) && isLang(lang) ? [source, lang] : null;
}

export function productAttribution(headers: Headers | null | undefined): {
  source: Source | 'unknown';
  browserLanguage?: Lang;
  uiLanguage?: string;
  campaign?: ProductCampaign;
} {
  const header = headers?.get('cookie');
  const first = parseSourceCookie(header);
  const chosenLocale = readCookie(header, 'NEXT_LOCALE');
  const [firstLocale, campaign, extra] = readCookie(header, 'rf_product')?.split('.') ?? [];
  const firstUiLanguage = extra === undefined && isProductUiLanguage(firstLocale);
  return {
    source: first?.[0] ?? 'unknown',
    browserLanguage: first?.[1],
    uiLanguage: isProductUiLanguage(chosenLocale)
      ? chosenLocale
      : firstUiLanguage
        ? firstLocale
        : undefined,
    campaign: first && firstUiLanguage && isProductCampaign(campaign) ? campaign : undefined,
  };
}
