'use client';

import { Fragment } from 'react';
import { useTranslations } from 'next-intl';
import { getActivePack } from '@/lib/data-layer';
import { clozeTokenSeparator, resolveClozeTokens } from '@/lib/languages';
import { splitTrailingPunctuation } from '@/lib/words';

const BLANK_PATTERN = /(_____+)/g;

/**
 * Renders a review sentence (plain or with `_____` blanks) where every non-blank
 * word is clickable to open the TranslationDrawer — CJK-safe via resolveClozeTokens.
 */
export default function ClickableReviewSentence({
  text,
  contextSentence,
  onWordClick,
  className = '',
}: {
  text: string;
  contextSentence: string;
  onWordClick?: (word: string, contextSentence: string, displaySentence: string) => void;
  className?: string;
}) {
  const t = useTranslations('practice');
  if (!onWordClick) {
    return <p className={className}>{text}</p>;
  }

  const pack = getActivePack();
  const segments = text.split(BLANK_PATTERN);

  return (
    <p className={className}>
      {segments.map((segment, segIdx) => {
        if (!segment) return null;
        if (/^_____+$/.test(segment)) {
          return (
            <span key={`blank-${segIdx}`} className="font-medium tracking-wider">
              {segment}
            </span>
          );
        }
        const leadSpace = /^\s+/.exec(segment)?.[0] ?? '';
        const trailSpace = /\s+$/.exec(segment)?.[0] ?? '';
        const inner = segment.trim();
        if (!inner) return <Fragment key={`ws-${segIdx}`}>{segment}</Fragment>;

        const tokens = resolveClozeTokens(inner, null, pack);
        const gap = clozeTokenSeparator(inner, tokens);

        return (
          <Fragment key={`seg-${segIdx}`}>
            {leadSpace}
            {tokens.map((token, idx) => {
              const [core, punct] = splitTrailingPunctuation(token);
              const clean = core.replace(/^[^\p{L}\p{N}]+/u, '');
              const leadPunct = core.slice(0, core.length - clean.length);
              const sep = idx < tokens.length - 1 ? gap : '';
              if (!clean) {
                return (
                  <Fragment key={`${segIdx}-${idx}`}>
                    {token}
                    {sep}
                  </Fragment>
                );
              }
              return (
                <Fragment key={`${segIdx}-${idx}`}>
                  {leadPunct}
                  <button
                    type="button"
                    onClick={() => onWordClick(clean, contextSentence, text)}
                    aria-label={t('lookUp', { word: clean })}
                    className="cursor-pointer rounded px-0.5 transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {clean}
                  </button>
                  {punct}
                  {sep}
                </Fragment>
              );
            })}
            {trailSpace}
          </Fragment>
        );
      })}
    </p>
  );
}
