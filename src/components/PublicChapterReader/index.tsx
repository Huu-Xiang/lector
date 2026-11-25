'use client';

import { useEffect, useMemo, useRef, useState, type FocusEvent, type MouseEvent } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface PublicChapterReaderProps {
  language: string;
  paragraphs: string[];
  hardWords: string[];
  registerHref: string;
  /** Optional initial active paragraph index (used in unit tests to verify keyboard mode). */
  initialActiveParagraph?: number | null;
}

const WORD_RE = /[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/gu;
const WORD_SPLIT = /([\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*)/gu;

/**
 * Extracts the word at `offset` inside `text`, returning null when clicking
 * whitespace or punctuation. Pure helper so it can be unit-tested cleanly.
 */
export function extractWordAtOffset(text: string, offset: number): string | null {
  if (!text || offset < 0 || offset > text.length) return null;
  WORD_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WORD_RE.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (offset >= start && offset <= end) {
      return match[0];
    }
    if (start > offset) break;
  }
  return null;
}

function wordAtPoint(x: number, y: number): string | null {
  if (typeof document === 'undefined') return null;

  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };

  let node: Node | null = null;
  let offset = -1;

  if (typeof doc.caretPositionFromPoint === 'function') {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos) {
      node = pos.offsetNode;
      offset = pos.offset;
    }
  } else if (typeof doc.caretRangeFromPoint === 'function') {
    const range = doc.caretRangeFromPoint(x, y);
    if (range) {
      node = range.startContainer;
      offset = range.startOffset;
    }
  }

  if (node && node.nodeType === Node.TEXT_NODE && typeof node.textContent === 'string') {
    return extractWordAtOffset(node.textContent, offset);
  }
  return null;
}

/**
 * Progressive-enhancement chapter reader for public free-book SEO pages.
 * Renders clean, lightweight <p> paragraphs during SSR (zero per-word <button>
 * bloat). Pointer taps use click delegation; keyboard focus expands only the
 * active paragraph into native <button> word controls for full keyboard access.
 */
export default function PublicChapterReader({
  language,
  paragraphs,
  hardWords,
  registerHref,
  initialActiveParagraph = null,
}: PublicChapterReaderProps) {
  const t = useTranslations('publicBooks');
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [activeParagraph, setActiveParagraph] = useState<number | null>(initialActiveParagraph);
  const hardSet = useMemo(() => new Set(hardWords.map((w) => w.toLowerCase())), [hardWords]);
  const paragraphRefs = useRef<Array<HTMLParagraphElement | null>>([]);
  const pendingFocusParagraph = useRef<number | null>(null);
  const isPointerDown = useRef(false);

  useEffect(() => {
    if (activeParagraph !== null && pendingFocusParagraph.current === activeParagraph) {
      pendingFocusParagraph.current = null;
      paragraphRefs.current[activeParagraph]?.querySelector('button')?.focus();
    }
  }, [activeParagraph]);

  const handleChapterClick = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement | null)?.closest('button')) return;
    const word = wordAtPoint(e.clientX, e.clientY);
    if (word) {
      setSelectedWord(word);
    }
  };

  const handleParagraphFocus = (pIdx: number, e: FocusEvent<HTMLParagraphElement>) => {
    if (isPointerDown.current || e.target !== e.currentTarget) return;
    pendingFocusParagraph.current = pIdx;
    setActiveParagraph(pIdx);
  };

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
        onMouseDown={() => {
          isPointerDown.current = true;
        }}
        onMouseUp={() => {
          isPointerDown.current = false;
        }}
        onKeyDown={() => {
          isPointerDown.current = false;
        }}
        onClick={handleChapterClick}
        className="cursor-pointer space-y-4 font-serif text-lg leading-8"
        data-testid="book-chapter"
      >
        {paragraphs.map((paragraph, pIdx) => {
          const isExpanded = activeParagraph === pIdx;
          return (
            <p
              key={pIdx}
              ref={(el) => {
                paragraphRefs.current[pIdx] = el;
              }}
              tabIndex={isExpanded ? undefined : 0}
              onFocus={(e) => handleParagraphFocus(pIdx, e)}
            >
              {isExpanded
                ? paragraph.split(WORD_SPLIT).map((part, i) => {
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
                  })
                : paragraph}
            </p>
          );
        })}
      </div>
    </div>
  );
}
