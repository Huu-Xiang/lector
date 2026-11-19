import { looksLikeBot } from './traffic-source';

interface EngagementState {
  engaged: boolean;
  pending: Set<() => void>;
}

const states = new WeakMap<Document, EngagementState>();
const activityEvents = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'click'] as const;

function stateFor(doc: Document): EngagementState {
  const existing = states.get(doc);
  if (existing) return existing;
  const state: EngagementState = { engaged: false, pending: new Set() };
  states.set(doc, state);

  const flush = () => {
    if (!state.engaged || doc.visibilityState !== 'visible') return;
    for (const callback of [...state.pending]) {
      state.pending.delete(callback);
      callback();
    }
  };
  const onActivity = (event: Event) => {
    if (!event.isTrusted || doc.visibilityState !== 'visible') return;
    state.engaged = true;
    for (const type of activityEvents) doc.removeEventListener(type, onActivity, true);
    flush();
  };
  for (const type of activityEvents) {
    doc.addEventListener(type, onActivity, { capture: true, passive: true });
  }
  doc.addEventListener('visibilitychange', flush);
  return state;
}

export function afterAnalyticsEngagement(callback: () => void): () => void {
  if (
    typeof document === 'undefined' ||
    typeof navigator === 'undefined' ||
    looksLikeBot(navigator.userAgent, navigator.webdriver)
  )
    return () => {};
  const state = stateFor(document);
  if (state.engaged && document.visibilityState === 'visible') {
    callback();
    return () => {};
  }
  state.pending.add(callback);
  return () => state.pending.delete(callback);
}

if (typeof document !== 'undefined') stateFor(document);
