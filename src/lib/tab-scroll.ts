import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const TAB_PATHS = new Set(['/', '/practice', '/journal', '/vocab', '/stats']);
const offsets = new Map<string, number>();

export function isTabPath(path: string): boolean {
  return TAB_PATHS.has(path);
}

export function recordTabScroll(path: string, y: number): void {
  if (isTabPath(path)) offsets.set(path, y);
}

export function savedTabScroll(path: string): number {
  return offsets.get(path) ?? 0;
}

export function forgetTabScroll(): void {
  offsets.clear();
}

/**
 * Keeps a tab's window scroll for the session: records it while the tab is shown,
 * and restores it once `ready` says the content has drawn.
 */
export function useTabScroll(ready: boolean): void {
  const pathname = usePathname();
  const restored = useRef(false);

  useEffect(() => {
    if (!isTabPath(pathname)) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (restored.current) recordTabScroll(pathname, window.scrollY);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pathname]);

  useEffect(() => {
    if (!ready || restored.current || !isTabPath(pathname)) return;
    const frame = requestAnimationFrame(() => {
      window.scrollTo(0, savedTabScroll(pathname));
      restored.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, pathname]);
}
