'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { getPageRange } from '@/lib/pagination';
import { PAGE_SIZE_OPTIONS } from '../constants';
import { Select } from '@/components/ui/select';

interface PaginationControlsProps {
  /** 1-indexed current page. */
  currentPage: number;
  /** Total number of pages (always >= 1). */
  pageCount: number;
  /** Rows shown per page. */
  pageSize: number;
  /** Total number of items across all pages (the filtered set). */
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

/**
 * Footer pagination control for the vocab list: a rows-per-page selector plus
 * an "X–Y of Z" range and prev/next navigation. Page state lives in the parent
 * (VocabList); this component is presentational.
 */
export default function PaginationControls({
  currentPage,
  pageCount,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: PaginationControlsProps) {
  const t = useTranslations('vocab.pagination');
  const { from, to } = getPageRange(currentPage, pageSize, totalItems);

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-4"
      aria-label={t('label')}
      data-testid="vocab-pagination"
    >
      {/* Rows-per-page selector */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <label htmlFor="vocab-page-size">{t('rowsPerPage')}</label>
        <Select
          wrapperClassName="inline-block"
          id="vocab-page-size"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </Select>
      </div>

      {/* Range + page navigation */}
      <div className="flex items-center gap-3">
        <span
          className="text-sm text-muted-foreground"
          data-testid="vocab-pagination-range"
          aria-live="polite"
        >
          {t('range', { from, to, total: totalItems })}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            aria-label={t('previous')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span
            className="px-2 text-sm font-medium text-foreground"
            data-testid="vocab-pagination-page"
            aria-live="polite"
          >
            {t('page', { current: currentPage, total: pageCount })}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= pageCount}
            aria-label={t('next')}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </nav>
  );
}
