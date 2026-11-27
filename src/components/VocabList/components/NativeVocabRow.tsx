import { useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { haptic } from '@/lib/native-app';
import { swipeDirection, swipeOffset, swipeStaysOpen, SWIPE_ACTION_WIDTH } from '../swipe';

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface NativeVocabRowProps {
  swipeEnabled: boolean;
  open: boolean;
  editing: boolean;
  children: ReactNode;
  actions: ReactNode;
  onOpenChange: (open: boolean) => void;
  onActivate: () => void;
  checkbox: ReactNode;
}

export default function NativeVocabRow({
  swipeEnabled,
  open,
  editing,
  children,
  actions,
  onOpenChange,
  onActivate,
  checkbox,
}: NativeVocabRowProps) {
  const gesture = useRef<{
    x: number;
    y: number;
    offset: number;
    direction: 'horizontal' | 'vertical' | null;
  } | null>(null);
  const suppressClick = useRef(false);
  const [offset, setOffset] = useState<number | null>(null);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);
  const revealed = swipeEnabled && !editing && (open || (offset !== null && offset < 0));
  const translation = editing || !swipeEnabled ? 0 : (offset ?? (open ? -SWIPE_ACTION_WIDTH : 0));

  return (
    <li
      className="relative overflow-hidden border-b border-border/60 last:border-0"
      data-native-vocab-row
      data-swipe-open={swipeEnabled && open && !editing ? 'true' : 'false'}
    >
      {revealed && (
        <div className="absolute inset-y-0 right-0 flex w-[152px] items-stretch">{actions}</div>
      )}
      <div
        className="native-vocab-swipe-content relative flex items-center bg-card"
        data-dragging={offset !== null ? 'true' : undefined}
        style={{
          transform: !swipeEnabled
            ? undefined
            : reducedMotion
              ? 'none'
              : `translateX(${translation}px)`,
          left: swipeEnabled && reducedMotion ? translation : undefined,
          touchAction: swipeEnabled ? 'pan-y' : undefined,
        }}
        onPointerDown={(event) => {
          if (!swipeEnabled || editing || event.button !== 0) return;
          suppressClick.current = false;
          gesture.current = {
            x: event.clientX,
            y: event.clientY,
            offset: open ? -SWIPE_ACTION_WIDTH : 0,
            direction: null,
          };
          if (!open) onOpenChange(false);
        }}
        onPointerMove={(event) => {
          const drag = gesture.current;
          if (!drag) return;
          const deltaX = event.clientX - drag.x;
          const deltaY = event.clientY - drag.y;
          drag.direction ??= swipeDirection(deltaX, deltaY);
          if (drag.direction) suppressClick.current = true;
          if (drag.direction !== 'horizontal') return;
          event.currentTarget.setPointerCapture(event.pointerId);
          setOffset(swipeOffset(drag.offset, deltaX));
        }}
        onPointerUp={(event) => {
          const drag = gesture.current;
          gesture.current = null;
          if (drag?.direction === 'horizontal') {
            const next = swipeStaysOpen(swipeOffset(drag.offset, event.clientX - drag.x));
            if (next !== open) void haptic();
            onOpenChange(next);
          }
          setOffset(null);
        }}
        onPointerCancel={() => {
          gesture.current = null;
          setOffset(null);
        }}
      >
        {checkbox}
        <button
          type="button"
          onClick={(event) => {
            if (swipeEnabled && event.detail !== 0 && suppressClick.current) return;
            if (swipeEnabled && open) onOpenChange(false);
            else onActivate();
          }}
          className="native-grouped-row flex min-h-14 min-w-11 flex-1 items-center gap-3 px-4 py-3 text-start"
        >
          {children}
        </button>
      </div>
    </li>
  );
}
