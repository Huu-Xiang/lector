import { NextResponse, type NextRequest } from 'next/server';
import {
  READFOX_LOCALE_HEADER,
  READFOX_LOCALE_PREFIX_HEADER,
  parsePublicLocalePath,
} from '@/lib/public-locale';
import { isNoIndexSite } from '@/lib/site-seo';

export function proxy(request: NextRequest) {
  const parsed = parsePublicLocalePath(request.nextUrl.pathname);
  let response: NextResponse;

  if (parsed) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(READFOX_LOCALE_HEADER, parsed.locale);
    requestHeaders.set(READFOX_LOCALE_PREFIX_HEADER, parsed.prefix);
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = parsed.rewritePath;
    response = NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } });
  } else {
    response = NextResponse.next();
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
