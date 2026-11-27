'use client';

import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Loader2,
  RefreshCw,
  Trash,
  Upload,
} from 'lucide-react';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import type { WordState } from '@/lib/data-layer';
import { getPageCount, clampPage, paginate } from '@/lib/pagination';
import { SETTINGS_KEYS } from '@/app/(app)/settings/constants';
import VocabRow from './components/VocabRow';
import PaginationControls from './components/PaginationControls';
import { stateFilters, stateOrder, DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from './constants';
import { AnkiCardType, SortDirection, SortField, VocabListProps } from './types';
import { useActiveLanguage } from '@/utils/hooks';
import { Button, buttonVariants } from '../ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import OnboardingTip from '@/components/OnboardingTip';
import { useLibraryTitleResolver } from '@/lib/library-titles';
import { Select } from '@/components/ui/select';
import StateIndicator from '@/components/StateIndicator';
import { useIsNativeApp } from '@/lib/native-app';

export default function VocabList({
  entries,
  collections,
  onEntryClick,
  onExportToAnki,
  onMarkAsKnown,
  onSyncWithAnki,
  showAnkiOnboardingTip = false,
  onAnkiOnboardingTipDone,
  isLoading = false,
  onBulkDelete,
}: VocabListProps) {
  const t = useTranslations('vocab.list');
  const tState = useTranslations('vocab.states');
  const tDetail = useTranslations('vocab.detail');
  const nativeApp = useIsNativeApp();
  const [editing, setEditing] = useState(false);

  // Filter state
  const [stateFilter, setStateFilter] = useState<WordState | 'all' | 'learning'>('all');
  const [bookFilter, setBookFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Sort state
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Pagination state. The full filtered/sorted set lives in memory; we render
  // only the current page so the DOM stays small for large vocabularies (#66).
  // The page-size choice persists to localStorage (matches the card-type pref).
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE;
    const saved = Number(localStorage.getItem(SETTINGS_KEYS.VOCAB_PAGE_SIZE));
    return (PAGE_SIZE_OPTIONS as readonly number[]).includes(saved) ? saved : DEFAULT_PAGE_SIZE;
  });

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Action loading states
  const [isExporting, setIsExporting] = useState(false);
  const [isMarkingKnown, setIsMarkingKnown] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Export-to-Anki modal state. Card type pre-selects the user's last choice
  // (persisted to localStorage) so heavy Cloze users don't flip on every open.
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [cardType, setCardType] = useState<AnkiCardType>(() => {
    if (typeof window === 'undefined') return 'basic';
    const saved = localStorage.getItem('lector-anki-card-type');
    return saved === 'cloze' ? 'cloze' : 'basic';
  });
  const updateCardType = (next: AnkiCardType) => {
    setCardType(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('lector-anki-card-type', next);
    }
  };

  // Create a map of collectionId to title for display
  const titleOf = useLibraryTitleResolver(collections);
  const bookTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    collections.forEach((c) => map.set(c.id, titleOf(c)));
    return map;
  }, [collections, titleOf]);

  // Locale-aware sort for the active language (#289): bare localeCompare uses
  // the browser UI locale, which mis-collates ä/é/å and non-Latin scripts.
  const pack = useActiveLanguage();
  const collator = useMemo(() => new Intl.Collator(pack.script.bcp47), [pack]);

  // Denominator matches the active view's visible pool: "All" excludes ignored
  // words so the header never claims e.g. "10 of 15" when no filter is active.
  const visibleBaseTotal = useMemo(
    () =>
      stateFilter === 'ignored'
        ? entries.filter((e) => e.state === 'ignored').length
        : entries.filter((e) => e.state !== 'ignored').length,
    [entries, stateFilter],
  );

  // Filter and sort entries
  const filteredEntries = useMemo(() => {
    let result = [...entries];

    // Apply state filter: "all" keeps ignored words out of the main list, while
    // selecting "ignored" explicitly lets the learner inspect and undo ignored words.
    if (stateFilter === 'all') {
      result = result.filter((e) => e.state !== 'ignored');
    } else if (stateFilter === 'learning') {
      // "Learning" includes new, level1-4 (not known or ignored)
      result = result.filter((e) => e.state !== 'known' && e.state !== 'ignored');
    } else {
      result = result.filter((e) => e.state === stateFilter);
    }

    // Apply book filter
    if (bookFilter !== 'all') {
      result = result.filter((e) => (e.collectionId ?? e.bookId) === bookFilter);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (e) =>
          e.text.toLowerCase().includes(query) ||
          e.translation.toLowerCase().includes(query) ||
          e.sentence.toLowerCase().includes(query),
      );
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'text':
          comparison = collator.compare(a.text, b.text);
          break;
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'state':
          comparison = stateOrder[a.state] - stateOrder[b.state];
          break;
        case 'bookId':
          const sourceA = a.collectionId ?? a.bookId;
          const sourceB = b.collectionId ?? b.bookId;
          const titleA = sourceA ? bookTitleMap.get(sourceA) || '' : '';
          const titleB = sourceB ? bookTitleMap.get(sourceB) || '' : '';
          comparison = collator.compare(titleA, titleB);
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [
    entries,
    stateFilter,
    bookFilter,
    searchQuery,
    sortField,
    sortDirection,
    bookTitleMap,
    collator,
  ]);

  // Pagination derivation: the visible slice of the filtered/sorted set.
  const pageCount = getPageCount(filteredEntries.length, pageSize);
  const paginatedEntries = useMemo(
    () => paginate(filteredEntries, currentPage, pageSize),
    [filteredEntries, currentPage, pageSize],
  );

  // Jump back to page 1 whenever the result set itself changes (new search or
  // filter). Sorting deliberately keeps the page — it's the same set reordered.
  useEffect(() => {
    setCurrentPage(1);
  }, [stateFilter, bookFilter, searchQuery]);

  // Keep the current page valid when the page count shrinks (entries deleted,
  // page size raised) so the user is never stranded on an empty page.
  useEffect(() => {
    setCurrentPage((p) => clampPage(p, pageCount));
  }, [pageCount]);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
    if (typeof window !== 'undefined') {
      localStorage.setItem(SETTINGS_KEYS.VOCAB_PAGE_SIZE, String(size));
    }
  }, []);

  // Handle selection
  const handleSelect = useCallback((id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(id);
      } else {
        newSet.delete(id);
      }
      return newSet;
    });
  }, []);

  // Select-all spans every matching entry across all pages (not just the
  // visible page) — the bulk Anki/known actions operate on the whole filtered
  // set, and the action buttons show the selected count.
  const handleSelectAll = useCallback(
    (selected: boolean) => {
      if (selected) {
        setSelectedIds(new Set(filteredEntries.map((e) => e.id)));
      } else {
        setSelectedIds(new Set());
      }
    },
    [filteredEntries],
  );

  // Handle sort column click
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Sort indicator component
  const SortIndicator = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return (
      <span className="ml-1">
        {sortDirection === 'asc' ? (
          <ChevronUp className="inline h-4 w-4" />
        ) : (
          <ChevronDown className="inline h-4 w-4" />
        )}
      </span>
    );
  };

  // Bulk action handlers. The export button opens a modal that confirms the
  // card type; the actual onExportToAnki call fires from the modal's Export
  // action so the user has a moment to switch Basic <-> Cloze.
  const openExportModal = () => {
    if (selectedIds.size === 0) return;
    setExportModalOpen(true);
  };
  const confirmExportToAnki = async () => {
    setExportModalOpen(false);
    setIsExporting(true);
    try {
      await onExportToAnki(Array.from(selectedIds), cardType);
      setSelectedIds(new Set());
    } finally {
      setIsExporting(false);
    }
  };

  const handleBulkDeleteButtonPressed = async () => {
    if (selectedIds.size === 0) return;

    if (window.confirm(t('confirmBulkDelete', { count: selectedIds.size }))) {
      setIsDeleting(true);
      try {
        await onBulkDelete(Array.from(selectedIds));
        setSelectedIds(new Set());
      } finally {
        setIsDeleting(false);
      }
    }
  };

  const handleMarkAsKnown = async () => {
    if (selectedIds.size === 0) return;
    setIsMarkingKnown(true);
    try {
      await onMarkAsKnown(Array.from(selectedIds));
      setSelectedIds(new Set());
    } finally {
      setIsMarkingKnown(false);
    }
  };

  const handleSyncWithAnki = async () => {
    if (!onSyncWithAnki) return;
    onAnkiOnboardingTipDone?.();
    setIsSyncing(true);
    try {
      await onSyncWithAnki();
    } finally {
      setIsSyncing(false);
    }
  };

  const allSelected =
    filteredEntries.length > 0 && filteredEntries.every((e) => selectedIds.has(e.id));
  const someSelected = selectedIds.size > 0;

  return (
    <div className="native-vocab-list-page flex flex-col gap-4" data-testid="vocab-list">
      {/* Filters and Search */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Search */}
        <div className="min-w-[200px] flex-1">
          <input
            type="text"
            data-testid="vocab-search-input"
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="min-h-11 w-full rounded-lg border border-input bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none sm:min-h-0"
          />
        </div>

        {/* State Filter */}
        <Select
          className="min-h-11 sm:min-h-0"
          wrapperClassName="inline-block max-w-full min-w-0"
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value as WordState | 'all' | 'learning')}
        >
          {stateFilters.map((filter) => (
            <option key={filter.value} value={filter.value}>
              {filter.value === 'all' || filter.value === 'learning'
                ? t(`filter.${filter.value}`)
                : tState(filter.value)}
            </option>
          ))}
        </Select>

        {/* Book Filter */}
        <Select
          className="min-h-11 sm:min-h-0"
          wrapperClassName="w-full max-w-full min-w-0 sm:inline-block sm:w-auto"
          value={bookFilter}
          onChange={(e) => setBookFilter(e.target.value)}
        >
          <option value="all">{t('allCollections')}</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {titleOf(c)}
            </option>
          ))}
        </Select>
      </div>

      {/* Bulk Actions */}
      {(someSelected || onSyncWithAnki) && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {someSelected && (
            <>
              <Button onClick={openExportModal} disabled={isExporting}>
                {isExporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('exporting')}
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    {t('exportToAnki', { count: selectedIds.size })}
                  </>
                )}
              </Button>

              <Button onClick={handleMarkAsKnown} disabled={isMarkingKnown}>
                {isMarkingKnown ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('updating')}
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    {t('markAsKnown', { count: selectedIds.size })}
                  </>
                )}
              </Button>
              <Button
                onClick={handleBulkDeleteButtonPressed}
                variant="destructive"
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('deleting')}
                  </>
                ) : (
                  <>
                    <Trash className="h-4 w-4" />
                    {t('delete', { count: selectedIds.size })}
                  </>
                )}
              </Button>
            </>
          )}

          <div className="flex-1" />

          {onSyncWithAnki && (
            <div className="relative">
              <Button
                onClick={handleSyncWithAnki}
                disabled={isSyncing}
                className={
                  showAnkiOnboardingTip
                    ? 'relative z-[60] ring-2 ring-[var(--gold-strong)] ring-offset-2 ring-offset-background'
                    : undefined
                }
                data-testid="sync-with-anki"
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('syncing')}
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    {t('syncWithAnki')}
                  </>
                )}
              </Button>
              {showAnkiOnboardingTip && onAnkiOnboardingTipDone && (
                <OnboardingTip
                  title={t('ankiTip.title')}
                  body={t('ankiTip.body')}
                  onDismiss={onAnkiOnboardingTipDone}
                  testId="post-onboarding-anki-tip"
                  className="absolute top-[calc(100%+0.75rem)] right-0"
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Results count — the filtered total (the page footer shows the visible
          range). The page count itself is paginated below. */}
      <div
        className={`${nativeApp ? 'flex min-h-11 items-center justify-between gap-2 sm:block sm:min-h-0' : ''} text-sm text-muted-foreground`}
        data-testid="vocab-results-bar"
      >
        <span>
          {someSelected
            ? t('resultsSelected', {
                filtered: filteredEntries.length,
                total: visibleBaseTotal,
                selected: selectedIds.size,
              })
            : t('results', { filtered: filteredEntries.length, total: visibleBaseTotal })}
        </span>
        {nativeApp && (
          <div className="flex shrink-0 items-center gap-2 sm:hidden">
            {editing && (
              <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  aria-label={t('columns.text')}
                  onChange={(event) => handleSelectAll(event.target.checked)}
                  className="size-[20px] accent-primary"
                />
              </label>
            )}
            <Button
              variant="ghost"
              aria-pressed={editing}
              data-testid="native-vocab-edit"
              onClick={() => {
                setEditing(!editing);
                setSelectedIds(new Set());
              }}
              className="min-h-11 min-w-11"
            >
              {editing ? tDetail('cancel') : tDetail('edit')}
            </Button>
          </div>
        )}
      </div>

      {nativeApp && (
        <div className="sm:hidden" data-testid="native-vocab-list">
          <ul className="overflow-hidden rounded-2xl border border-border/60 bg-card">
            {paginatedEntries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center border-b border-border/60 last:border-0"
              >
                {editing && (
                  <label className="ms-2 flex size-11 shrink-0 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(entry.id)}
                      aria-label={entry.text}
                      onChange={(event) => handleSelect(entry.id, event.target.checked)}
                      className="size-[20px] accent-primary"
                    />
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => onEntryClick(entry)}
                  className="flex min-h-14 min-w-11 flex-1 items-center gap-3 px-4 py-3 text-start"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 text-[17px] font-semibold break-words">
                        {entry.text}
                      </span>
                      <StateIndicator state={entry.state} />
                    </span>
                    <span className="mt-1 line-clamp-2 text-[15px] text-muted-foreground">
                      {entry.translation}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </li>
            ))}
            {filteredEntries.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                {visibleBaseTotal === 0 ? t('emptyNoEntries') : t('emptyNoMatches')}
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Table */}
      <div
        className={`${nativeApp ? 'hidden sm:block' : ''} overflow-x-auto rounded-lg border border-border`}
      >
        <table className="w-full text-left">
          <thead className="bg-muted">
            <tr>
              <th className="w-11 px-1 py-1 sm:w-12 sm:px-4 sm:py-3">
                <label className="flex size-11 cursor-pointer items-center justify-center sm:size-auto">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                  />
                </label>
              </th>
              <th
                className="cursor-pointer px-2 py-3 text-sm font-semibold whitespace-nowrap text-foreground hover:text-foreground sm:px-4"
                onClick={() => handleSort('text')}
              >
                {t('columns.text')}
                <SortIndicator field="text" />
              </th>
              <th className="px-2 py-3 text-sm font-semibold whitespace-nowrap text-foreground sm:px-4">
                {t('columns.translation')}
              </th>
              <th
                className="cursor-pointer px-2 py-3 text-center text-sm font-semibold whitespace-nowrap text-foreground hover:text-foreground sm:px-4"
                onClick={() => handleSort('state')}
              >
                {t('columns.state')}
                <SortIndicator field="state" />
              </th>
              <th
                className="hidden cursor-pointer px-2 py-3 text-sm font-semibold whitespace-nowrap text-foreground hover:text-foreground sm:px-4 md:table-cell"
                onClick={() => handleSort('bookId')}
              >
                {t('columns.source')}
                <SortIndicator field="bookId" />
              </th>
              <th
                className="hidden cursor-pointer px-4 py-3 text-sm font-semibold text-foreground hover:text-foreground sm:table-cell"
                onClick={() => handleSort('createdAt')}
              >
                {t('columns.dateAdded')}
                <SortIndicator field="createdAt" />
              </th>
              <th className="hidden px-4 py-3 text-sm font-semibold text-foreground sm:table-cell">
                {t('columns.anki')}
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-muted-foreground">{t('loading')}</span>
                  </div>
                </td>
              </tr>
            ) : filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  {visibleBaseTotal === 0 ? t('emptyNoEntries') : t('emptyNoMatches')}
                </td>
              </tr>
            ) : (
              paginatedEntries.map((entry) => (
                <VocabRow
                  key={entry.id}
                  entry={entry}
                  bookTitle={
                    (entry.collectionId ?? entry.bookId)
                      ? bookTitleMap.get((entry.collectionId ?? entry.bookId)!)
                      : undefined
                  }
                  isSelected={selectedIds.has(entry.id)}
                  onSelect={handleSelect}
                  onClick={onEntryClick}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination — hidden while loading and when there are no results. */}
      {!isLoading && filteredEntries.length > 0 && (
        <PaginationControls
          currentPage={currentPage}
          pageCount={pageCount}
          pageSize={pageSize}
          totalItems={filteredEntries.length}
          onPageChange={setCurrentPage}
          onPageSizeChange={handlePageSizeChange}
        />
      )}

      {/* Export-to-Anki modal */}
      <Dialog open={exportModalOpen} onOpenChange={setExportModalOpen}>
        <DialogContent className="max-w-md rounded-xl p-6">
          <DialogTitle className="mb-1">{t('exportDialog.title')}</DialogTitle>
          <DialogDescription className="mb-5">
            {t('exportDialog.description', { count: selectedIds.size })}
          </DialogDescription>

          <div className="mb-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              data-testid="anki-card-type-basic"
              aria-pressed={cardType === 'basic'}
              onClick={() => updateCardType('basic')}
              className={`rounded-lg border p-4 text-left transition-colors ${
                cardType === 'basic'
                  ? 'border-primary bg-[var(--primary-soft)] ring-2 ring-primary'
                  : 'border-border hover:border-foreground/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">{t('exportDialog.basic')}</span>
                {cardType === 'basic' && <Check className="h-4 w-4 text-primary" strokeWidth={3} />}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('exportDialog.basicDescription')}
              </p>
            </button>

            <button
              type="button"
              data-testid="anki-card-type-cloze"
              aria-pressed={cardType === 'cloze'}
              onClick={() => updateCardType('cloze')}
              className={`rounded-lg border p-4 text-left transition-colors ${
                cardType === 'cloze'
                  ? 'border-primary bg-[var(--primary-soft)] ring-2 ring-primary'
                  : 'border-border hover:border-foreground/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">{t('exportDialog.cloze')}</span>
                {cardType === 'cloze' && <Check className="h-4 w-4 text-primary" strokeWidth={3} />}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('exportDialog.clozeDescription')}
              </p>
            </button>
          </div>

          <div className="flex justify-end gap-2">
            <DialogClose className={buttonVariants({ variant: 'ghost' })}>
              {t('exportDialog.cancel')}
            </DialogClose>
            <Button type="button" data-testid="anki-export-confirm" onClick={confirmExportToAnki}>
              {t('exportDialog.confirm', { count: selectedIds.size })}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
