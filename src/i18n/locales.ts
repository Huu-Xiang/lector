export interface UiLocale {
  code: string;
  native: string;
  rtl?: boolean;
}

/** Interface languages. Add one by shipping `messages/<code>.json` and listing it here. */
export const UI_LOCALES: readonly UiLocale[] = [
  { code: 'en', native: 'English' },
  { code: 'zh-CN', native: '简体中文' },
];

export const DEFAULT_LOCALE = 'en';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export function isUiLocale(code: unknown): code is string {
  return typeof code === 'string' && UI_LOCALES.some((l) => l.code === code);
}

export function isRtl(code: string): boolean {
  return UI_LOCALES.find((l) => l.code === code)?.rtl === true;
}

/** Best listed locale for one language tag such as `zh-Hans-CN` or `en-GB`. */
export function matchLocale(tag: string): string | null {
  const lower = tag.trim().toLowerCase();
  if (!lower) return null;
  const exact = UI_LOCALES.find((l) => l.code.toLowerCase() === lower);
  if (exact) return exact.code;
  const base = lower.split('-')[0];
  if (base === 'zh') {
    if (/-(tw|hk|mo|hant)/.test(lower))
      return UI_LOCALES.find((l) => l.code === 'zh-TW')?.code ?? null;
    return UI_LOCALES.find((l) => l.code === 'zh-CN')?.code ?? null;
  }
  return UI_LOCALES.find((l) => l.code.toLowerCase().split('-')[0] === base)?.code ?? null;
}

/** Cookie first, then the `Accept-Language` header in q order, then English. */
export function resolveLocale(
  cookie: string | null | undefined,
  acceptLanguage: string | null | undefined,
): string {
  if (isUiLocale(cookie)) return cookie;
  const tags = (acceptLanguage ?? '')
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { tag, q: q ? Number.parseFloat(q.trim().slice(2)) : 1 };
    })
    .filter((entry) => entry.tag && Number.isFinite(entry.q) && entry.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of tags) {
    const match = matchLocale(tag);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}
