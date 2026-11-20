'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface PublicChapterReaderProps {
  language: string;
  paragraphs: string[];
  hardWords: string[];
  registerHref: string;
}

const WORD_SPLIT = /([\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*)/gu;

/**
 * Progressive-enhancement chapter reader for public free-book SEO pages.
 * Renders the full server-rendered paragraphs inside <p> tags for crawlers and
 * adds instant, zero-API tap-to-preview interaction for visitors.
 */
export default function PublicChapterReader({
  language,
  paragraphs,
  hardWords,
  registerHref,
}: PublicChapterReaderProps) {
  const t = useTranslations('publicBooks');
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const hardSet = useMemo(() => new Set(hardWords.map((w) => w.toLowerCase())), [hardWords]);

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-border bg-muted/40 px-3.5 py-2 text-xs text-muted-foreground">
        {t('previewHint')}
      </p>

      {selectedWord && (
        <div
          role="region"
          aria-live="polite"
          data-testid="public-chapter-popover"
          className="flex items-start justify-between gap-3 rounded-xl border border-primary/40 bg-card p-4 shadow-sm"
        >
          <div className="min-w-0 space-y-1.5">
            <p lang={language} className="font-serif text-lg font-bold text-foreground">
              {selectedWord}
            </p>
            <p className="text-sm text-muted-foreground">{t('previewUnglossed')}</p>
            <Link
              href={registerHref}
              className="inline-block rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              {t('continueCta')}
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setSelectedWord(null)}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div
        lang={language}
        className="space-y-4 font-serif text-lg leading-8"
        data-testid="book-chapter"
      >
        {paragraphs.map((paragraph, pIdx) => (
          <p key={pIdx}>
            {paragraph.split(WORD_SPLIT).map((part, i) => {
              if (!part) return null;
              const isWord = /^[\p{L}\p{M}]/u.test(part);
              if (!isWord) return <span key={i}>{part}</span>;
              const isHard = hardSet.has(part.toLowerCase());
              const isSelected = selectedWord === part;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedWord(part)}
                  className={`inline cursor-pointer rounded px-0.5 text-left transition-colors ${
                    isSelected
                      ? 'bg-primary/20 ring-1 ring-primary'
                      : isHard
                        ? 'underline decoration-primary/50 decoration-dotted underline-offset-4 hover:bg-primary/10'
                        : 'hover:bg-accent'
                  }`}
                >
                  {part}
                </button>
              );
            })}
          </p>
        ))}
      </div>
    </div>
  );
}
