'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { apiUrl, isAuthRoute } from '@/lib/api-base';
import { useLectorMode } from '@/lib/use-env';
import {
  classifySource,
  hasSourceCookie,
  isCountedRoute,
  languageBucket,
  looksLikeBot,
  sourceCookieString,
} from '@/lib/traffic-source';

/**
 * Counts the first visit of a browser to a public page in anonymous daily totals
 * (api/src/lib/source-counts.ts). A first-party cookie keeps later pages from counting.
 */
export default function SourceBeacon() {
  const mode = useLectorMode();
  if (mode !== 'cloud') return null;
  return <CloudSourceBeacon />;
}

function CloudSourceBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!isCountedRoute(pathname, isAuthRoute(pathname))) return;
    if (looksLikeBot(navigator.userAgent, navigator.webdriver)) return;
    if (hasSourceCookie(document.cookie)) return;

    const source = classifySource({
      utmSource: new URLSearchParams(window.location.search).get('utm_source'),
      referrer: document.referrer,
      ownHost: window.location.hostname,
    });
    const lang = languageBucket(navigator.language);
    document.cookie = sourceCookieString(source, lang, window.location.protocol === 'https:');
    // Without the cookie every page would count again.
    if (!hasSourceCookie(document.cookie)) return;

    void fetch(apiUrl('/api/source-count'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, lang }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return null;
}
