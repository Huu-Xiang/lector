/**
 * First-touch traffic source for the anonymous daily counters. The closed lists
 * mirror api/src/lib/source-list.ts; the server rejects any other value.
 * No raw host or language tag leaves the browser: only a name from these lists.
 */
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

export const SOURCE_COOKIE = 'rf_src';
export const PRODUCT_COOKIE = 'rf_product';
export const SOURCE_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
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

const UTM_ALIASES: Record<string, Source> = {
  xhs: 'xiaohongshu',
  redbook: 'xiaohongshu',
  rednote: 'xiaohongshu',
  weixin: 'wechat',
  wx: 'wechat',
  twitter: 'x',
  gpt: 'chatgpt',
  openai: 'chatgpt',
  hn: 'hackernews',
  ycombinator: 'hackernews',
  ph: 'producthunt',
  fb: 'facebook',
  ig: 'instagram',
  yt: 'youtube',
  tg: 'telegram',
  ddg: 'duckduckgo',
  '360': 'so360',
  so: 'so360',
  newsletter: 'email',
  mail: 'email',
};

/** Names a utm_source may not claim as itself: they are not a named channel. */
const NOT_A_CHANNEL: readonly Source[] = ['campaign', 'other', 'direct'];

/**
 * Checked in order: the first match wins, so a specific host (gemini.google.com,
 * mail.google.com) must come before its parent domain. Each pattern matches the
 * domain and its subdomains.
 */
const REFERRER_HOSTS: [Source, RegExp][] = [
  ['email', /^(mail|webmail)\.|(^|\.)(outlook\.(live|office|office365)\.com|outlook\.com)$/],
  ['gemini', /(^|\.)gemini\.google\.com$/],
  ['copilot', /(^|\.)copilot\.microsoft\.com$/],
  ['google', /(^|\.)google\.(com|(com?\.)?[a-z]{2})$/],
  ['bing', /(^|\.)bing\.com$/],
  ['baidu', /(^|\.)baidu\.com$/],
  ['duckduckgo', /(^|\.)duckduckgo\.com$/],
  ['yandex', /(^|\.)yandex\.(com|com\.tr|ru|by|kz|ua|uz)$/],
  ['sogou', /(^|\.)sogou\.com$/],
  ['so360', /(^|\.)(so\.com|haosou\.com)$/],
  ['yahoo', /(^|\.)yahoo\.(com|co\.jp|[a-z]{2})$/],
  ['naver', /(^|\.)naver\.com$/],
  ['ecosia', /(^|\.)ecosia\.org$/],
  ['brave', /(^|\.)brave\.com$/],
  ['chatgpt', /(^|\.)(chatgpt\.com|openai\.com)$/],
  ['perplexity', /(^|\.)perplexity\.ai$/],
  ['claude', /(^|\.)claude\.ai$/],
  ['deepseek', /(^|\.)deepseek\.com$/],
  ['kimi', /(^|\.)(kimi\.com|kimi\.ai|moonshot\.cn)$/],
  ['doubao', /(^|\.)doubao\.com$/],
  ['xiaohongshu', /(^|\.)(xiaohongshu\.com|xhslink\.com)$/],
  ['zhihu', /(^|\.)zhihu\.com$/],
  ['weibo', /(^|\.)(weibo\.com|weibo\.cn|t\.cn)$/],
  ['douban', /(^|\.)douban\.com$/],
  ['bilibili', /(^|\.)(bilibili\.com|b23\.tv)$/],
  ['v2ex', /(^|\.)v2ex\.com$/],
  ['appinn', /(^|\.)appinn\.com$/],
  ['sspai', /(^|\.)sspai\.com$/],
  ['juejin', /(^|\.)(juejin\.cn|juejin\.im)$/],
  ['wechat', /(^|\.)(weixin\.qq\.com|wechat\.com)$/],
  ['reddit', /(^|\.)(reddit\.com|redd\.it)$/],
  ['x', /(^|\.)(x\.com|twitter\.com|t\.co)$/],
  ['facebook', /(^|\.)(facebook\.com|fb\.com|fb\.me)$/],
  ['instagram', /(^|\.)instagram\.com$/],
  ['linkedin', /(^|\.)(linkedin\.com|lnkd\.in)$/],
  ['youtube', /(^|\.)(youtube\.com|youtu\.be)$/],
  ['github', /(^|\.)github\.com$/],
  ['hackernews', /(^|\.)news\.ycombinator\.com$/],
  ['producthunt', /(^|\.)producthunt\.com$/],
  ['telegram', /(^|\.)(t\.me|telegram\.org)$/],
  ['discord', /(^|\.)(discord\.com|discord\.gg)$/],
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
  if (utm) {
    const named = UTM_ALIASES[utm] ?? utm;
    return isSource(named) && !NOT_A_CHANNEL.includes(named) ? named : 'campaign';
  }

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
  const primary = (navigatorLanguage ?? '').toLowerCase().split(/[-_]/)[0];
  const tag = primary === 'in' ? 'id' : primary;
  return (LANGS as readonly string[]).includes(tag) && tag !== 'other' ? (tag as Lang) : 'other';
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

export function productCampaign(raw: string | null): ProductCampaign | undefined {
  const campaign = raw?.trim().toLowerCase();
  if (!campaign) return undefined;
  return (PRODUCT_CAMPAIGNS as readonly string[]).includes(campaign)
    ? (campaign as ProductCampaign)
    : 'other';
}

export function productCookieString(
  uiLanguage: string,
  campaign: ProductCampaign | undefined,
  secure: boolean,
): string {
  const value = campaign ? `${uiLanguage}.${campaign}` : uiLanguage;
  return (
    `${PRODUCT_COOKIE}=${value}; Max-Age=${SOURCE_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax` +
    (secure ? '; Secure' : '')
  );
}

export function readFirstTouch(cookieHeader: string): {
  source?: Source;
  campaign?: ProductCampaign;
} {
  const cookies = new Map<string, string>();
  for (const part of cookieHeader.split(';')) {
    const [name, value, extra] = part.trim().split('=');
    if (value !== undefined && extra === undefined) cookies.set(name, value);
  }
  const [source, browserLanguage, sourceExtra] = cookies.get(SOURCE_COOKIE)?.split('.') ?? [];
  const [, campaign, campaignExtra] = cookies.get(PRODUCT_COOKIE)?.split('.') ?? [];
  if (!isSource(source) || !(LANGS as readonly string[]).includes(browserLanguage) || sourceExtra) {
    return {};
  }
  return {
    source,
    campaign: campaign && campaignExtra === undefined ? productCampaign(campaign) : undefined,
  };
}

const PUBLIC_PAGE_FEATURES: Record<string, string> = {
  '/': 'landing',
  '/landing': 'landing',
  '/books': 'books',
  '/vocab-test': 'vocab_test',
  '/pricing': 'pricing',
  '/register': 'register',
  '/checkout': 'checkout',
};

export function publicPageDimensions(
  pathname: string,
  isPublicRoute: boolean,
): { feature: string; language?: string; publicBook?: string; step?: string } | undefined {
  if (!isPublicRoute) return undefined;
  const feature = PUBLIC_PAGE_FEATURES[pathname];
  if (feature) return { feature };
  const level = /^\/books\/([a-z]{2,3})\/level\/([abc][12])$/.exec(pathname.toLowerCase());
  if (level) return { feature: 'books_level', language: level[1], step: level[2] };
  const language = /^\/books\/([a-z]{2,3})$/.exec(pathname);
  if (language) return { feature: 'books_language', language: language[1] };
  const book = /^\/books\/([a-z]{2,3})\/([a-z0-9]+(?:-[a-z0-9]+)*)(\/read)?$/.exec(pathname);
  if (book && book[2] !== 'authors') {
    return {
      feature: book[3] ? 'book_preview' : 'book',
      language: book[1],
      publicBook: `${book[1]}/${book[2]}`,
    };
  }
  return undefined;
}

/** Pages where a first visit is counted. Sign-in, password reset and checkout serve people who already have an account. */
const UNCOUNTED_ROUTES = ['/login', '/reset-password', '/two-factor', '/checkout'];

export function isCountedRoute(pathname: string, isPublicRoute: boolean): boolean {
  if (!isPublicRoute) return false;
  return !UNCOUNTED_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}
