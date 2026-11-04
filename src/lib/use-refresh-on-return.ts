import { useEffect, useRef } from 'react';

type Listenable = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export function subscribeToReturn(
  onReturn: () => void,
  doc: Listenable & { visibilityState: string },
  win: Listenable,
): () => void {
  const onVisibility = () => {
    if (doc.visibilityState === 'visible') onReturn();
  };
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('focus', onReturn);
  return () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('focus', onReturn);
  };
}

export function useRefreshOnReturn(onReturn: () => void) {
  const ref = useRef(onReturn);
  useEffect(() => {
    ref.current = onReturn;
  });
  useEffect(() => subscribeToReturn(() => ref.current(), document, window), []);
}
