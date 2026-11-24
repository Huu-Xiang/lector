import { NextResponse, type NextRequest } from 'next/server';
import {
  READFOX_LOCALE_HEADER,
  READFOX_LOCALE_PREFIX_HEADER,
  parsePublicLocalePath,
} from '@/lib/public-locale';
import { isNoIndexSite } from '@/lib/site-seo';

const INTERNAL_PROXY_TOKEN_HEADER = 'x-readfox-proxy-token';
const INTERNAL_PROXY_TOKEN = globalThis.crypto.randomUUID();

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const isInternalRewriteHop =
    requestHeaders.get(INTERNAL_PROXY_TOKEN_HEADER) === INTERNAL_PROXY_TOKEN;
  requestHeaders.delete(INTERNAL_PROXY_TOKEN_HEADER);

  const parsed = parsePublicLocalePath(request.nextUrl.pathname);
  let response: NextResponse;

  if (parsed) {
    requestHeaders.set(READFOX_LOCALE_HEADER, parsed.locale);
    requestHeaders.set(READFOX_LOCALE_PREFIX_HEADER, parsed.prefix);
    requestHeaders.set(INTERNAL_PROXY_TOKEN_HEADER, INTERNAL_PROXY_TOKEN);
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = parsed.rewritePath;
    response = NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } });
  } else {
    // Strip client-supplied internal locale headers so external callers cannot spoof locale
    // or canonical URLs, while preserving headers forwarded by our own internal rewrite hop.
    if (!isInternalRewriteHop) {
      requestHeaders.delete(READFOX_LOCALE_HEADER);
      requestHeaders.delete(READFOX_LOCALE_PREFIX_HEADER);
    }
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (isNoIndexSite()) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|library-covers|icons|favicon\\.ico|sw\\.js|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|llms\\.txt|indexnow-key\\.txt|__env\\.js|.*\\.(?:png|jpg|jpeg|webp|svg|ico|woff2?)$).*)',
  ],
};
