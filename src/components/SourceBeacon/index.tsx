'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useLocale } from 'next-intl';
import { apiUrl, isAuthRoute } from '@/lib/api-base';
import { trackProductEvent } from '@/lib/product-analytics';
import { useLectorMode } from '@/lib/use-env';
import {
  classifySource,
  hasSourceCookie,
  isCountedRoute,
  languageBucket,
  looksLikeBot,
  productCampaign,
  productCookieString,
  publicPageDimensions,
  readFirstTouch,
  sourceCookieString,
} from '@/lib/traffic-source';

const RECENT_EXPOSURE_KEY = 'readfox-recent-public-exposure';
const RECENT_EXPOSURE_MS = 30_000;

function claimExposure(bucket: string): boolean {
  try {
    const saved = window.sessionStorage.getItem(RECENT_EXPOSURE_KEY);
    const [previousBucket, previousTime] = saved?.split('|') ?? [];
    const now = Date.now();
    if (previousBucket === bucket && now - Number(previousTime) < RECENT_EXPOSURE_MS) return false;
    window.sessionStorage.setItem(RECENT_EXPOSURE_KEY, `${bucket}|${now}`);
  } catch {
    // A privacy setting that blocks local storage must not change navigation.
  }
  return true;
}

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
  const uiLanguage = useLocale();

  useEffect(() => {
    const isPublicRoute = isAuthRoute(pathname);
    const firstVisitRoute = isCountedRoute(pathname, isPublicRoute);
    const page = publicPageDimensions(pathname, isPublicRoute);
    if (!firstVisitRoute && !page) return;
    if (looksLikeBot(navigator.userAgent, navigator.webdriver)) return;

    const params = new URLSearchParams(window.location.search);
    const utmSource = params.get('utm_source');
    const campaign = productCampaign(params.get('utm_campaign'));
    const source = classifySource({
      utmSource,
      referrer: document.referrer,
      ownHost: window.location.hostname,
    });
    const lang = languageBucket(navigator.language);

    if (firstVisitRoute && !hasSourceCookie(document.cookie)) {
      const secure = window.location.protocol === 'https:';
      document.cookie = sourceCookieString(source, lang, secure);
      // Without the cookie every page would count as a new first visit.
      if (hasSourceCookie(document.cookie)) {
        document.cookie = productCookieString(uiLanguage, campaign, secure);
        void fetch(apiUrl('/api/source-count'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source, lang }),
          keepalive: true,
        }).catch(() => {});
      }
    }

    if (page) {
      const firstTouch = readFirstTouch(document.cookie);
      const entrySource = utmSource ? source : (firstTouch.source ?? source);
      const entryCampaign = campaign ?? firstTouch.campaign;
      const bucket = [
        page.feature,
        page.language,
        page.publicBook,
        page.step,
        uiLanguage,
        entrySource,
        entryCampaign,
      ].join(':');
      if (claimExposure(bucket)) {
        trackProductEvent(
          {
            event: 'page_view',
            ...page,
            source: entrySource,
            browserLanguage: lang,
            uiLanguage,
            campaign: entryCampaign,
          },
          { anonymous: true },
        );
      }
    }
  }, [pathname, uiLanguage]);

  return null;
}
