import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { applySheetVh, readStoredSheetVh, SHEET_VH_DEFAULT } from './sheet-height';

const EXPANDED_VH = 82;
const SNAP_DISTANCE = 36;

export function useNativeSheetDrag(
  sheet: RefObject<HTMLDivElement | null>,
  active: boolean,
  onClose: () => void,
) {
  const [expanded, setExpanded] = useState(false);
  const gesture = useRef<{ pointer: number; start: number; delta: number; frame: number } | null>(
    null,
  );

  const reset = useCallback((node: HTMLDivElement) => {
    if (gesture.current?.frame) cancelAnimationFrame(gesture.current.frame);
    gesture.current = null;
    node.style.removeProperty('transform');
    node.removeAttribute('data-dragging');
  }, []);

  useEffect(() => {
    if (!active) return;
    const node = sheet.current;
    return () => {
      if (node) reset(node);
      applySheetVh(readStoredSheetVh() ?? SHEET_VH_DEFAULT);
    };
  }, [active, reset, sheet]);

  useEffect(() => {
    if (active) applySheetVh(expanded ? EXPANDED_VH : SHEET_VH_DEFAULT);
  }, [active, expanded]);

  return {
    expanded,
    handle: {
      onClick: (event: React.MouseEvent) => {
        if (event.detail === 0) setExpanded(!expanded);
      },
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (!event.isPrimary || event.button !== 0 || !sheet.current) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        gesture.current = { pointer: event.pointerId, start: event.clientY, delta: 0, frame: 0 };
        sheet.current.setAttribute('data-dragging', '');
      },
      onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        const drag = gesture.current;
        const node = sheet.current;
        if (!drag || !node || drag.pointer !== event.pointerId) return;
        const upwardLimit = expanded
          ? 24
          : (window.innerHeight * (EXPANDED_VH - SHEET_VH_DEFAULT)) / 100;
        drag.delta = Math.max(
          -upwardLimit,
          Math.min(window.innerHeight * 0.3, event.clientY - drag.start),
        );
        if (drag.frame) return;
        drag.frame = requestAnimationFrame(() => {
          node.style.transform = `translate3d(0, ${drag.delta}px, 0)`;
          drag.frame = 0;
        });
      },
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
        const drag = gesture.current;
        const node = sheet.current;
        if (!drag || !node || drag.pointer !== event.pointerId) return;
        const travel = event.clientY - drag.start;
        reset(node);
        if (travel > SNAP_DISTANCE && !expanded) onClose();
        else if (travel > SNAP_DISTANCE) setExpanded(false);
        else if (travel < -SNAP_DISTANCE || Math.abs(travel) < 6) setExpanded(!expanded);
      },
      onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => {
        if (sheet.current && gesture.current?.pointer === event.pointerId) reset(sheet.current);
      },
    },
  };
}
