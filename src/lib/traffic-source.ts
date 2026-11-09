/**
 * First-touch traffic source for the anonymous daily counters. The closed list
 * mirrors api/src/lib/source-list.ts; the server rejects any other value.
 */
export const SOURCES = [
  'google',
  'bing',
  'baidu',
  'xiaohongshu',
  'wechat',
  'weibo',
  'reddit',
  'x',
  'youtube',
  'chatgpt',
  'perplexity',
  'claude',
  'other',
  'direct',
] as const;
export type Source = (typeof SOURCES)[number];
export type Lang = 'zh' | 'other';

export const SOURCE_COOKIE = 'rf_src';
export const SOURCE_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const UTM_ALIASES: Record<string, Source> = {
  xhs: 'xiaohongshu',
  redbook: 'xiaohongshu',
  weixin: 'wechat',
  twitter: 'x',
  gpt: 'chatgpt',
  openai: 'chatgpt',
};

// Host suffixes: `google.` matches every country domain, the rest match the domain and subdomains.
const REFERRER_HOSTS: [Source, RegExp][] = [
  ['google', /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/],
  ['bing', /(^|\.)bing\.com$/],
  ['baidu', /(^|\.)baidu\.com$/],
  ['xiaohongshu', /(^|\.)(xiaohongshu\.com|xhslink\.com)$/],
  ['wechat', /(^|\.)(weixin\.qq\.com|wechat\.com)$/],
  ['weibo', /(^|\.)(weibo\.com|weibo\.cn|t\.cn)$/],
  ['reddit', /(^|\.)(reddit\.com|redd\.it)$/],
  ['x', /(^|\.)(x\.com|twitter\.com|t\.co)$/],
  ['youtube', /(^|\.)(youtube\.com|youtu\.be)$/],
  ['chatgpt', /(^|\.)(chatgpt\.com|openai\.com)$/],
  ['perplexity', /(^|\.)perplexity\.ai$/],
  ['claude', /(^|\.)claude\.ai$/],
];

export function isSource(value: string): value is Source {
  return (SOURCES as readonly string[]).includes(value);
}

/** `utm_source` wins, then the referrer host. A referrer from the site itself counts as direct. */
export function classifySource(input: {
  utmSource: string | null;
  referrer: string;
  ownHost: string;
}): Source {
  const utm = (input.utmSource ?? '').trim().toLowerCase();
  if (utm) return UTM_ALIASES[utm] ?? (isSource(utm) ? utm : 'other');

  let host: string;
  try {
    host = new URL(input.referrer).hostname.toLowerCase();
  } catch {
    return 'direct';
  }
  if (!host || host === input.ownHost.toLowerCase()) return 'direct';
  return REFERRER_HOSTS.find(([, pattern]) => pattern.test(host))?.[0] ?? 'other';
}

export function languageBucket(navigatorLanguage: string | undefined): Lang {
  return (navigatorLanguage ?? '').toLowerCase().startsWith('zh') ? 'zh' : 'other';
}

const BOT_USER_AGENT =
  /bot|crawl|spider|slurp|headless|phantom|lighthouse|prerender|curl|wget|python|httpclient/i;

export function looksLikeBot(userAgent: string, webdriver: boolean | undefined): boolean {
  return webdriver === true || BOT_USER_AGENT.test(userAgent);
}

export function sourceCookieValue(source: Source, lang: Lang): string {
  return `${source}.${lang}`;
}

export function hasSourceCookie(cookieHeader: string): boolean {
  return cookieHeader.split(';').some((part) => part.trim().startsWith(`${SOURCE_COOKIE}=`));
}

export function sourceCookieString(source: Source, lang: Lang, secure: boolean): string {
  return (
    `${SOURCE_COOKIE}=${sourceCookieValue(source, lang)}; Max-Age=${SOURCE_COOKIE_MAX_AGE_SECONDS}` +
    `; Path=/; SameSite=Lax${secure ? '; Secure' : ''}`
  );
}

/** Pages where a first visit is counted. Sign-in, password reset and checkout serve people who already have an account. */
const UNCOUNTED_ROUTES = ['/login', '/reset-password', '/two-factor', '/checkout'];

export function isCountedRoute(pathname: string, isPublicRoute: boolean): boolean {
  if (!isPublicRoute) return false;
  return !UNCOUNTED_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}
