const SITE_HOST = 'readfox.app';

/** Keep in step with `public/.well-known/apple-app-site-association`. */
const SITE_PATHS = [
  /^\/api\/auth\/verify-email$/,
  /^\/api\/auth\/reset-password\/[^/]+$/,
  /^\/reset-password$/,
  /^\/register$/,
];

const REDIRECT_PARAMS = ['callbackURL', 'next', 'redirect', 'redirectTo'];

function staysOnSite(value: string): boolean {
  if (value.startsWith('/')) return !value.startsWith('//') && !value.includes('\\');
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === SITE_HOST;
  } catch {
    return false;
  }
}

/**
 * The path and query the app may load for an opened link, or null to ignore it.
 * Only https links on readfox.app with a listed path, `readfox://share`, and the
 * widget's `readfox://practice`.
 * The result is always relative, never a URL taken from the link.
 */
export function resolveAppLink(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol === 'readfox:') {
    if (url.hostname === 'share') return `/share${url.search}`;
    return url.hostname === 'practice' ? '/practice' : null;
  }
  if (url.protocol !== 'https:' || url.hostname !== SITE_HOST) return null;
  if (!SITE_PATHS.some((pattern) => pattern.test(url.pathname))) return null;
  for (const name of REDIRECT_PARAMS) {
    const value = url.searchParams.get(name);
    if (value !== null && !staysOnSite(value)) return null;
  }
  return `${url.pathname}${url.search}`;
}
