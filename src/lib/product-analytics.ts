import { apiUrl, lectorMode } from './api-base';
import { afterAnalyticsEngagement } from './analytics-engagement';

export interface ProductEventInput {
  event: string;
  language?: string;
  feature?: string;
  outcome?: string;
  step?: string;
  value?: number;
  lessonId?: string;
  roundId?: string;
  publicBook?: string;
  source?: string;
  browserLanguage?: string;
  uiLanguage?: string;
  campaign?: string;
}

export function productEventKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

/** A background request with no auth redirect, quota dialog, or impact on its caller. */
export function trackProductEvent(
  data: ProductEventInput,
  options: { anonymous?: boolean; key?: string } = {},
): void {
  if (typeof window === 'undefined' || lectorMode() !== 'cloud') return;
  const path = options.anonymous ? '/api/product-analytics/public' : '/api/product-analytics';
  const key = options.key ?? productEventKey();
  const send = () => {
    try {
      void fetch(apiUrl(path), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(options.anonymous ? { 'x-readfox-engaged': '1' } : {}),
        },
        credentials: options.anonymous ? 'omit' : 'include',
        body: JSON.stringify({ data, key }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Analytics may be unavailable while the product action still succeeds.
    }
  };
  if (options.anonymous) afterAnalyticsEngagement(send);
  else send();
}
