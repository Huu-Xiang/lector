import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, LOCALE_COOKIE, resolveLocale } from './locales';

type Messages = { [key: string]: string | Messages };

/** Missing keys fall back to English, so a half-translated locale never shows a raw key. */
function withFallback(base: Messages, overlay: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const existing = out[key];
    out[key] =
      typeof value === 'object' && typeof existing === 'object'
        ? withFallback(existing, value)
        : value;
  }
  return out;
}

export default getRequestConfig(async () => {
  const [store, requestHeaders] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale(
    store.get(LOCALE_COOKIE)?.value,
    requestHeaders.get('accept-language'),
  );
  const english = (await import('../../messages/en.json')).default as Messages;
  const messages =
    locale === DEFAULT_LOCALE
      ? english
      : withFallback(english, (await import(`../../messages/${locale}.json`)).default as Messages);
  return { locale, messages };
});
