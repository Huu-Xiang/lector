'use client';

import { Check, Plus } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useYouTubeImportPending } from '@/lib/use-env';
import { cn } from '@/lib/utils';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { haptic } from '@/lib/native-app';
import { useIsNativePhone } from '@/lib/use-native-phone';
import { X } from 'lucide-react';
import { IMPORT_OPTIONS } from './constants';
import type { ImportDropdownProps, ImportSource } from './types';

export default function ImportDropdown({
  onFileImport,
  onAudioImport,
  onUrlImport,
  onYouTubeImport,
  onPasteImport,
  disabled = false,
  isImporting = false,
  label,
  size = 'default',
  variant = 'default',
  testId,
  destinations,
  destinationId = null,
  onDestinationChange,
  minimalOnMobile,
  anchorToToolbarOnMobile = false,
}: ImportDropdownProps) {
  const t = useTranslations('library.import');
  const tDrawer = useTranslations('reader.drawer');
  const nativePhone = useIsNativePhone();
  const youtubeImportPending = useYouTubeImportPending();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen && !nativePhone) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, nativePhone]);

  // Close dropdown when pressing Escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handlers: Record<ImportSource, () => void> = {
    file: onFileImport,
    audio: onAudioImport,
    url: onUrlImport,
    youtube: onYouTubeImport,
    paste: onPasteImport,
  };

  const handleSelect = (source: ImportSource) => {
    if (nativePhone) void haptic();
    setIsOpen(false);
    handlers[source]();
  };

  // The ungrouped library is a destination like any group, so it heads the list
  // and stays selectable after the user picks a group.
  const destinationList: Array<{ id: string | null; name: string }> = destinations?.length
    ? [{ id: null, name: t('ungrouped') }, ...destinations]
    : [];

  const options = (
    <>
      {destinationList.length > 0 && (
        <div className="mb-1 border-b border-border pb-1">
          <p className="px-4 pt-1.5 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t('addTo')}
          </p>
          <div className="max-h-44 overflow-y-auto">
            {destinationList.map((destination) => {
              const selected = destination.id === destinationId;
              return (
                <button
                  key={destination.id ?? 'ungrouped'}
                  type="button"
                  onClick={() => {
                    if (nativePhone) void haptic();
                    onDestinationChange?.(destination.id);
                  }}
                  aria-pressed={selected}
                  data-testid={`import-destination-${destination.id ?? 'ungrouped'}`}
                  className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-accent ${nativePhone ? 'min-h-12' : ''}`}
                >
                  <Check
                    className={`h-4 w-4 shrink-0 text-primary ${selected ? 'opacity-100' : 'opacity-0'}`}
                    aria-hidden="true"
                  />
                  <span className="truncate">{destination.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {IMPORT_OPTIONS.map(({ source, icon: Icon }) => {
        const comingSoon = youtubeImportPending && source === 'youtube';
        return (
          <button
            key={source}
            type="button"
            disabled={comingSoon}
            onClick={() => handleSelect(source)}
            className={`flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-start text-sm text-popover-foreground transition-colors enabled:hover:bg-accent disabled:text-muted-foreground ${nativePhone ? 'min-h-12 border-b border-border/60 last:border-0' : ''}`}
          >
            <Icon size="20" className="shrink-0" aria-hidden="true" />
            <span>{t(`options.${source}`)}</span>
            {comingSoon && <span className="ms-auto text-xs">{t('comingSoon')}</span>}
          </button>
        );
      })}
    </>
  );

  return (
    <div ref={dropdownRef} className={cn('relative', anchorToToolbarOnMobile && 'max-sm:static')}>
      <Button
        onClick={() => {
          if (nativePhone) void haptic();
          setIsOpen(!isOpen);
        }}
        disabled={disabled || isImporting}
        size={size}
        variant={variant}
        data-testid={testId}
      >
        {isImporting ? (
          <>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
            <span className={minimalOnMobile ? 'hidden md:block' : ''}>{t('importing')}</span>
          </>
        ) : (
          <>
            <Plus className="h-5 w-5" />
            <span className={minimalOnMobile ? 'hidden items-center sm:flex' : ''}>
              {label ?? t('label')}
            </span>
          </>
        )}
      </Button>

      {nativePhone ? (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent
            className="flex max-w-lg flex-col overflow-hidden"
            data-testid="native-import-sheet"
          >
            <div className="flex items-center justify-between px-4 pb-2">
              <DialogTitle>{label ?? t('label')}</DialogTitle>
              <DialogClose
                className="grid size-11 place-items-center"
                aria-label={tDrawer('close')}
              >
                <span className="grid size-8 place-items-center rounded-full bg-[var(--ios-fill)]">
                  <X className="size-4" aria-hidden />
                </span>
              </DialogClose>
            </div>
            <div className="mx-4 min-h-0 overflow-y-auto rounded-2xl border border-border/60">
              {options}
            </div>
          </DialogContent>
        </Dialog>
      ) : (
        isOpen && (
          <div
            className={cn(
              'absolute right-0 z-50 mt-2 w-56 rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-lg',
              anchorToToolbarOnMobile && 'max-sm:top-full',
            )}
          >
            {options}
          </div>
        )
      )}
    </div>
  );
}
