'use client';

import { useEffect, useState } from 'react';
import { describeReadingFeedArticles, type ArticleDescription } from './data-layer';

const BATCH = 12;

/** Native-language title and summary for feed articles; they arrive after the list. */
export function useArticleDescriptions(
  ids: readonly string[],
  native: string,
  language: string,
): Record<string, ArticleDescription> {
  const [found, setFound] = useState<Record<string, ArticleDescription>>({});
  const key = ids.join(',');

  useEffect(() => {
    if (!key || native === language) return;
    let cancelled = false;
    const wanted = key.split(',');
    (async () => {
      for (let i = 0; i < wanted.length; i += BATCH) {
        const batch = wanted.slice(i, i + BATCH);
        try {
          const got = await describeReadingFeedArticles(batch, native);
          if (cancelled) return;
          setFound((prev) => ({ ...prev, ...got }));
        } catch {
          // The article still shows with its original title.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, native, language]);

  return found;
}
