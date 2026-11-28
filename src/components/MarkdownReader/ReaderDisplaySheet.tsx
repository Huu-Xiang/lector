'use client';

import { useRef, useState } from 'react';
import { Check, SlidersHorizontal, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { haptic } from '@/lib/native-app';
import { WORD_HIGHLIGHT_MODES, type WordHighlightMode } from './theme';

export default function ReaderDisplaySheet({
  startEdit,
  mode,
  onModeChange,
  autoPronounce,
  onAutoPronounceChange,
  showDifficulty,
  onDifficulty,
}: {
  startEdit?: () => void;
  mode: WordHighlightMode;
  onModeChange: (mode: WordHighlightMode) => void;
  autoPronounce: boolean;
  onAutoPronounceChange: (value: boolean) => void;
  showDifficulty: boolean;
  onDifficulty: (outcome: 'too_easy' | 'just_right' | 'too_hard') => void;
}) {
  const t = useTranslations('reader.page');
  const tMarkdown = useTranslations('reader.markdown');
  const tDrawer = useTranslations('reader.drawer');
  const [open, setOpen] = useState(false);
  const openingEditor = useRef(false);
  const choose = (action: () => void) => {
    void haptic();
    setOpen(false);
    action();
  };
  return (
    <>
      <button
        type="button"
        aria-label={t('displayMenu')}
        title={t('displayMenu')}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="reader-display-menu-btn"
        onClick={() => {
          openingEditor.current = false;
          void haptic();
          setOpen(true);
        }}
        className="order-3 flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground active:opacity-60"
      >
        <SlidersHorizontal className="size-5" aria-hidden />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          finalFocus={() => !openingEditor.current}
          className="flex max-w-lg flex-col overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 pb-2">
            <DialogTitle>{t('displayMenu')}</DialogTitle>
            <DialogClose aria-label={tDrawer('close')} className="grid size-11 place-items-center">
              <span className="grid size-8 place-items-center rounded-full bg-[var(--ios-fill)]">
                <X className="size-4" aria-hidden />
              </span>
            </DialogClose>
          </div>
          <div
            role="menu"
            aria-label={t('displayMenu')}
            data-testid="reader-display-menu"
            className="min-h-0 space-y-4 overflow-y-auto px-4 pb-2"
            onKeyDown={(event) => {
              if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
              const items = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  'button[role^="menuitem"]:not(:disabled)',
                ),
              );
              if (!items.length) return;
              event.preventDefault();
              const current = items.indexOf(document.activeElement as HTMLButtonElement);
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? items.length - 1
                    : (current + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
              items[next].focus();
            }}
          >
            {startEdit && (
              <button
                type="button"
                role="menuitem"
                data-testid="native-edit-text-menu-item"
                onClick={() => {
                  openingEditor.current = true;
                  choose(startEdit);
                }}
                className="min-h-12 w-full rounded-xl bg-[var(--ios-fill)] px-4 text-start text-[17px] font-medium"
              >
                {tMarkdown('editText')}
              </button>
            )}
            <div role="group" aria-label={t('wordMarking')}>
              <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">
                {t('wordMarking')}
              </p>
              <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60">
                {WORD_HIGHLIGHT_MODES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={mode === value}
                    data-testid={`highlight-mode-${value}`}
                    onClick={() => choose(() => onModeChange(value))}
                    className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-start"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[17px] font-medium">
                        {t(`markingMode.${value}`)}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {t(`markingModeHint.${value}`)}
                      </span>
                    </span>
                    {mode === value && (
                      <Check className="size-5 shrink-0 text-primary" aria-hidden />
                    )}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={autoPronounce}
              data-testid="toggle-auto-pronounce"
              onClick={() => choose(() => onAutoPronounceChange(!autoPronounce))}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl bg-[var(--ios-fill)] px-4 py-2 text-start"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-medium">{t('autoPronounceTouch')}</span>
                <span className="block text-xs text-muted-foreground">
                  {t('autoPronounceHint')}
                </span>
              </span>
              {autoPronounce && <Check className="size-5 shrink-0 text-primary" aria-hidden />}
            </button>
            {showDifficulty && (
              <div
                role="group"
                aria-label={t('analyticsDifficulty')}
                data-testid="native-reading-difficulty"
              >
                <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">
                  {t('analyticsDifficulty')}
                </p>
                <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60">
                  {(['too_easy', 'just_right', 'too_hard'] as const).map((outcome, index) => (
                    <button
                      key={outcome}
                      type="button"
                      role="menuitem"
                      className="min-h-12 w-full px-4 text-start text-[17px]"
                      onClick={() => choose(() => onDifficulty(outcome))}
                    >
                      {t(
                        (['analyticsTooEasy', 'analyticsJustRight', 'analyticsTooHard'] as const)[
                          index
                        ],
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
