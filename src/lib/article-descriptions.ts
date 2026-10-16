'use client';

import { useEffect, useState } from 'react';
import { describeReadingFeedArticles, type ArticleDescription } from './data-layer';
import { knownDescriptions, rememberDescriptions } from './description-cache';

const BATCH = 12;

/** Native-language title and summary for feed articles. Seen ones return at once; new ones arrive later. */
export function useArticleDescriptions(
  ids: readonly string[],
  native: string,
  language: string,
): Record<string, ArticleDescription> {
  const [, bump] = useState(0);
  const key = ids.join(',');

  useEffect(() => {
    if (!key || native === language) return;
    let cancelled = false;
    const known = knownDescriptions(native, key.split(','));
    const missing = key.split(',').filter((id) => !known[id]);
    (async () => {
      for (let i = 0; i < missing.length; i += BATCH) {
        try {
          const got = await describeReadingFeedArticles(missing.slice(i, i + BATCH), native);
          rememberDescriptions(native, got);
          if (!cancelled) bump((n) => n + 1);
        } catch {
          // The article still shows with its original title.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, native, language]);

  if (!key || native === language) return {};
  return knownDescriptions(native, ids);
}
