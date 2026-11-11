import { useEffect, useRef } from 'react';
import { activeTenantId } from './language-cache';
import { QUERY_UPDATED_EVENT, type QueryUpdatedDetail } from './query-cache';

type Listenable = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export function subscribeToQueryUpdates(
  scopes: readonly string[],
  onUpdate: () => void,
  target: Listenable,
  tenant: () => string | null,
): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<QueryUpdatedDetail>).detail;
    if (detail && scopes.includes(detail.scope) && detail.tenant === tenant()) onUpdate();
  };
  target.addEventListener(QUERY_UPDATED_EVENT, listener);
  return () => target.removeEventListener(QUERY_UPDATED_EVENT, listener);
}

const COALESCE_MS = 200;

export function useQueryRefresh(scopes: readonly string[], onUpdate: () => void) {
  const ref = useRef(onUpdate);
  useEffect(() => {
    ref.current = onUpdate;
  });
  const key = scopes.join('|');
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = subscribeToQueryUpdates(
      key.split('|'),
      () => {
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          ref.current();
        }, COALESCE_MS);
      },
      window,
      activeTenantId,
    );
    return () => {
      stop();
      if (timer !== null) clearTimeout(timer);
    };
  }, [key]);
}
