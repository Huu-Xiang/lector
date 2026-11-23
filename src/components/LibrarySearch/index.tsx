'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LoaderCircle, Search, X } from 'lucide-react';
import {
  searchLessons,
  type CollectionGroup,
  type LessonSearchMatch,
  type LessonSearchResponse,
} from '@/lib/data-layer';
import {
  buildConcordanceJumpHref,
  stashConcordanceJump,
} from '@/lib/concordance-jump';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import TargetText from '@/components/TargetText';

const SEARCH_DEBOUNCE_MS = 250;
const MAX_QUERY_LENGTH = 200;

function formatTimestampMs(startMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(startMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}

export interface LibrarySearchProps {
  activeLanguage: string;
  groups: CollectionGroup[];
  hasUngrouped: boolean;
  onActiveChange?: (active: boolean) => void;
}

export default function LibrarySearch({
  activeLanguage,
  groups,
  hasUngrouped,
  onActiveChange,
}: LibrarySearchProps) {
  const t = useTranslations('library.search');
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('');
  const [result, setResult] = useState<LessonSearchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchNonce, setSearchNonce] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const immediateNextRef = useRef(false);
  const prevLanguageRef = useRef(activeLanguage);

  const trimmed = query.trim();
  const isActive = trimmed.length > 0;

  // Keep parent in sync so the browsing grid hides cleanly during active search.
  useEffect(() => {
    onActiveChange?.(isActive);
  }, [isActive, onActiveChange]);

  // Safely read initial `?q=` client-side without `useSearchParams` (preserves static prerendering).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const initial = new URLSearchParams(window.location.search).get('q')?.trim() ?? '';
    if (initial) {
      immediateNextRef.current = true;
      setQuery(initial.slice(0, MAX_QUERY_LENGTH));
    }
  }, []);

  // Reset scope and immediately re-run search if the active language changes.
  useEffect(() => {
    if (prevLanguageRef.current === activeLanguage) return;
    prevLanguageRef.current = activeLanguage;
    setScope('');
    setResult(null);
    setError(null);
    immediateNextRef.current = true;
    setSearchNonce((n) => n + 1);
  }, [activeLanguage]);

  // Clear stale group scope if that group was deleted or no longer applies.
  const effectiveScope =
    scope === '' ||
    (scope === 'ungrouped' && hasUngrouped) ||
    groups.some((g) => g.id === scope)
      ? scope
      : '';

  useEffect(() => {
    if (effectiveScope !== scope) {
      setScope(effectiveScope);
    }
  }, [effectiveScope, scope]);

  const clearSearch = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    requestIdRef.current += 1;
    setQuery('');
    setResult(null);
    setError(null);
    setIsSearching(false);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.has('q')) {
        params.delete('q');
        const nextSearch = params.toString();
        router.replace(nextSearch ? `/?${nextSearch}` : '/');
      }
    }
  }, [router]);

  useEffect(() => {
    if (!trimmed) {
      abortRef.current?.abort();
      abortRef.current = null;
      requestIdRef.current += 1;
      setResult(null);
      setError(null);
      setIsSearching(false);
      return;
    }

    const delay = immediateNextRef.current ? 0 : SEARCH_DEBOUNCE_MS;
    immediateNextRef.current = false;

    const requestId = ++requestIdRef.current;
    setIsSearching(true);
    setError(null);

    const timer = window.setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      searchLessons(
        {
          q: trimmed,
          groupId: effectiveScope || undefined,
          language: activeLanguage,
        },
        { signal: controller.signal },
      )
        .then((data) => {
          if (requestId !== requestIdRef.current) return;
          setResult(data);
          setError(null);
          setIsSearching(false);
        })
        .catch((err: unknown) => {
          if (requestId !== requestIdRef.current) return;
          if (err instanceof Error && err.name === 'AbortError') return;
          setError(err instanceof Error && err.message ? err.message : t('error'));
          setIsSearching(false);
        });
    }, delay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [trimmed, effectiveScope, activeLanguage, searchNonce, t]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleRetry = useCallback(() => {
    immediateNextRef.current = true;
    setSearchNonce((n) => n + 1);
  }, []);

  const handleSelectHit = useCallback(
    (match: LessonSearchMatch) => {
      stashConcordanceJump({
        lessonId: match.lessonId,
        q: result?.query ?? trimmed,
        sentence: match.snippet,
        occ: match.occ,
        ...(match.segmentIndex !== undefined ? { segmentIndex: match.segmentIndex } : {}),
      });
      router.push(buildConcordanceJumpHref(match.lessonId, match.segmentIndex));
    },
    [result?.query, router, trimmed],
  );

  const showScopeSelector = groups.length > 0;

  return (
    <section className="mb-4 sm:mb-6" data-testid="library-search">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="search"
            value={query}
            maxLength={MAX_QUERY_LENGTH}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query.length > 0) {
                e.preventDefault();
                clearSearch();
              }
            }}
            placeholder={t('placeholder')}
            aria-label={t('ariaLabel')}
            data-testid="library-search-input"
            className="h-10 w-full rounded-lg border border-input bg-background pr-10 pl-9 text-base text-foreground shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:text-sm dark:bg-input/30 [&::-webkit-search-cancel-button]:hidden"
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => {
                clearSearch();
                inputRef.current?.focus();
              }}
              aria-label={t('clear')}
              title={t('clear')}
              data-testid="library-search-clear"
              className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {showScopeSelector && (
          <Select
            value={effectiveScope}
            onChange={(e) => {
              immediateNextRef.current = true;
              setScope(e.target.value);
            }}
            aria-label={t('scopeLabel')}
            data-testid="library-search-scope"
            wrapperClassName="sm:w-52 shrink-0"
            className="h-10 rounded-lg bg-background"
          >
            <option value="">{t('allLibrary')}</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
            {hasUngrouped && <option value="ungrouped">{t('ungrouped')}</option>}
          </Select>
        )}
      </div>

      {isActive && (
        <div className="mt-4 space-y-3" data-testid="library-search-results">
          {isSearching && (
            <div
              className="flex items-center gap-2 text-sm text-muted-foreground"
              role="status"
              data-testid="library-search-loading"
            >
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>{t('searching')}</span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              data-testid="library-search-error"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              <span>{error}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRetry}
                data-testid="library-search-retry"
              >
                {t('retry')}
              </Button>
            </div>
          )}

          {!isSearching && !error && result && result.matches.length === 0 && (
            <div
              data-testid="library-search-empty"
              className="panel flex flex-col items-center justify-center gap-3 px-4 py-8 text-center"
            >
              <p className="text-sm text-muted-foreground">
                {t('noResults', { query: result.query || trimmed })}
              </p>
              {effectiveScope && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    immediateNextRef.current = true;
                    setScope('');
                  }}
                >
                  {t('searchAllLibrary')}
                </Button>
              )}
            </div>
          )}

          {result && result.matches.length > 0 && (
            <>
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span data-testid="library-search-count">
                  {t('resultCount', { count: result.matches.length })}
                </span>
              </div>

              <ul className="space-y-2">
                {result.matches.map((match, idx) => {
                  const start = Math.max(0, Math.min(match.matchStart, match.snippet.length));
                  const end = Math.max(start, Math.min(match.matchEnd, match.snippet.length));
                  const showLessonSubtitle =
                    match.collectionTitle && match.collectionTitle !== match.lessonTitle;
                  return (
                    <li key={`${match.lessonId}:${match.segmentIndex ?? 'md'}:${match.occ}:${idx}`}>
                      <button
                        type="button"
                        onClick={() => handleSelectHit(match)}
                        data-testid="library-search-hit"
                        className="panel w-full cursor-pointer px-4 py-3 text-left transition-colors hover:border-ring hover:bg-accent/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {match.collectionTitle || match.lessonTitle}
                          </span>
                          {showLessonSubtitle && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="truncate">{match.lessonTitle}</span>
                            </>
                          )}
                          {match.groupName && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                              {match.groupName}
                            </span>
                          )}
                          {match.startMs !== undefined && (
                            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] tabular-nums">
                              {formatTimestampMs(match.startMs)}
                            </span>
                          )}
                        </div>
                        <TargetText as="p" className="text-sm leading-relaxed text-foreground">
                          {match.snippet.slice(0, start)}
                          <mark className="rounded bg-[var(--gold-soft)] px-0.5 font-semibold text-foreground">
                            {match.snippet.slice(start, end)}
                          </mark>
                          {match.snippet.slice(end)}
                        </TargetText>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {result.truncated && (
                <p
                  data-testid="library-search-truncated"
                  className="pt-1 text-center text-xs text-muted-foreground"
                >
                  {t('truncated', { count: result.matches.length })}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
