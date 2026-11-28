import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { haptic } from '@/lib/native-app';
import { applySheetVh, readStoredSheetVh, SHEET_VH_DEFAULT } from './sheet-height';

import {
  NATIVE_SHEET_DEFAULT,
  NATIVE_SHEET_EXPANDED,
  nativeSheetDetent,
  nativeSheetVelocity,
  nativeSheetVisualHeight,
  type PointerSample,
} from './native-sheet-physics';
export { NATIVE_SHEET_DEFAULT, NATIVE_SHEET_EXPANDED } from './native-sheet-physics';
const TAP_DISTANCE = 6;

export function useNativeSheetDrag(active: boolean, onClose?: () => void) {
  const [settledHeight, setSettledHeight] = useState(NATIVE_SHEET_DEFAULT);
  const [wasActive, setWasActive] = useState(active);
  const [dragging, setDragging] = useState(false);
  if (active !== wasActive) {
    setWasActive(active);
    setSettledHeight(NATIVE_SHEET_DEFAULT);
    setDragging(false);
  }
  const height = useRef(NATIVE_SHEET_DEFAULT);
  const gesture = useRef<{
    pointer: number;
    start: number;
    initial: number;
    viewport: number;
    rawNext: number;
    moved: boolean;
    samples: PointerSample[];
  } | null>(null);
  const ignoreClick = useRef(false);

  function update(value: number) {
    height.current = value;
    applySheetVh(value);
  }

  function finish(event: PointerEvent<HTMLButtonElement>, cancel: boolean) {
    const drag = gesture.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    gesture.current = null;
    setDragging(false);
    ignoreClick.current = drag.moved;
    if (!drag.moved) return;
    drag.samples.push({ clientY: event.clientY, timeStamp: event.timeStamp });
    const target = cancel
      ? drag.initial
      : nativeSheetDetent(drag.rawNext, nativeSheetVelocity(drag.samples));
    const next = target === 'dismiss' ? NATIVE_SHEET_DEFAULT : target;
    update(next);
    setSettledHeight(next);
    if (target === 'dismiss' || next !== drag.initial) haptic();
    if (target === 'dismiss') onClose?.();
  }

  useEffect(() => {
    if (!active) return;
    height.current = NATIVE_SHEET_DEFAULT;
    applySheetVh(NATIVE_SHEET_DEFAULT);
    return () => {
      gesture.current = null;
      ignoreClick.current = false;
      applySheetVh(readStoredSheetVh() ?? SHEET_VH_DEFAULT);
    };
  }, [active]);

  return {
    expanded: active && settledHeight > NATIVE_SHEET_DEFAULT,
    dragging: active && dragging,
    handle: {
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
        if (event.detail > 0 && ignoreClick.current) {
          ignoreClick.current = false;
          return;
        }
        const open = height.current <= NATIVE_SHEET_DEFAULT;
        const next = open ? NATIVE_SHEET_EXPANDED : NATIVE_SHEET_DEFAULT;
        update(next);
        setSettledHeight(next);
        haptic();
      },
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (!active || !event.isPrimary || event.button !== 0) return;
        ignoreClick.current = false;
        event.currentTarget.setPointerCapture(event.pointerId);
        gesture.current = {
          pointer: event.pointerId,
          start: event.clientY,
          initial: height.current,
          viewport: window.innerHeight,
          rawNext: height.current,
          moved: false,
          samples: [{ clientY: event.clientY, timeStamp: event.timeStamp }],
        };
      },
      onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        const drag = gesture.current;
        if (!drag || drag.pointer !== event.pointerId) return;
        const delta = drag.start - event.clientY;
        drag.samples.push({ clientY: event.clientY, timeStamp: event.timeStamp });
        drag.samples = drag.samples.filter((sample) => event.timeStamp - sample.timeStamp <= 150);
        drag.moved ||= Math.abs(delta) >= TAP_DISTANCE;
        if (!drag.moved) return;
        setDragging(true);
        drag.rawNext = drag.initial + (delta / drag.viewport) * 100;
        update(nativeSheetVisualHeight(drag.rawNext));
      },
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => finish(event, false),
      onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => finish(event, true),
      onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => finish(event, true),
    },
  };
}
