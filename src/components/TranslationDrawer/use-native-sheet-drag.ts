import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { applySheetVh, readStoredSheetVh, SHEET_VH_DEFAULT } from './sheet-height';

export const NATIVE_SHEET_DEFAULT = 34;
const MIN_HEIGHT = 25;
const MAX_HEIGHT = 86;
const TAP_DISTANCE = 5;

function bound(height: number) {
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, height));
}

export function useNativeSheetDrag(active: boolean) {
  const [settledHeight, setSettledHeight] = useState(NATIVE_SHEET_DEFAULT);
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    setSettledHeight(NATIVE_SHEET_DEFAULT);
  }
  const height = useRef(NATIVE_SHEET_DEFAULT);
  const gesture = useRef<{
    pointer: number;
    start: number;
    initial: number;
    viewport: number;
    next: number;
    frame: number;
    moved: boolean;
  } | null>(null);
  const ignoreClick = useRef(false);

  function update(value: number) {
    height.current = value;
    applySheetVh(value);
  }

  function finish(event: PointerEvent<HTMLButtonElement>, cancel: boolean) {
    const drag = gesture.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    if (drag.frame) cancelAnimationFrame(drag.frame);
    gesture.current = null;
    ignoreClick.current = drag.moved;
    const next = cancel ? drag.initial : drag.next;
    update(next);
    setSettledHeight(next);
  }

  useEffect(() => {
    if (!active) return;
    height.current = NATIVE_SHEET_DEFAULT;
    applySheetVh(NATIVE_SHEET_DEFAULT);
    return () => {
      if (gesture.current?.frame) cancelAnimationFrame(gesture.current.frame);
      gesture.current = null;
      ignoreClick.current = false;
      applySheetVh(readStoredSheetVh() ?? SHEET_VH_DEFAULT);
    };
  }, [active]);

  return {
    expanded: active && settledHeight > NATIVE_SHEET_DEFAULT,
    handle: {
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
        if (event.detail > 0 && ignoreClick.current) {
          ignoreClick.current = false;
          return;
        }
        const open = height.current <= NATIVE_SHEET_DEFAULT;
        const next = open ? MAX_HEIGHT : NATIVE_SHEET_DEFAULT;
        update(next);
        setSettledHeight(next);
      },
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (!event.isPrimary || event.button !== 0) return;
        ignoreClick.current = false;
        event.currentTarget.setPointerCapture(event.pointerId);
        gesture.current = {
          pointer: event.pointerId,
          start: event.clientY,
          initial: height.current,
          viewport: window.innerHeight,
          next: height.current,
          frame: 0,
          moved: false,
        };
      },
      onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        const drag = gesture.current;
        if (!drag || drag.pointer !== event.pointerId) return;
        const delta = drag.start - event.clientY;
        drag.moved ||= Math.abs(delta) >= TAP_DISTANCE;
        if (!drag.moved) return;
        drag.next = bound(drag.initial + (delta / drag.viewport) * 100);
        if (drag.frame) return;
        drag.frame = requestAnimationFrame(() => {
          update(drag.next);
          drag.frame = 0;
        });
      },
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => finish(event, false),
      onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => finish(event, true),
    },
  };
}
