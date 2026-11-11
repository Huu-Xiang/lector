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

export function isSource(value: unknown): value is Source {
  return typeof value === 'string' && (SOURCES as readonly string[]).includes(value);
}

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}

/** Reads `rf_src=<source>.<lang>` from a Cookie header; null when absent or not on the closed lists. */
export function parseSourceCookie(header: string | null | undefined): [Source, Lang] | null {
  for (const part of (header ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== SOURCE_COOKIE) continue;
    const [source, lang, extra] = rest.join('=').split('.');
    if (extra === undefined && isSource(source) && isLang(lang)) return [source, lang];
    return null;
  }
  return null;
}
