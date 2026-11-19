import { afterEach, describe, expect, it, vi } from 'vitest';
import { afterAnalyticsEngagement } from './analytics-engagement';

function browser(visible = true) {
  const handlers = new Map<string, Set<(event: Event) => void>>();
  const doc = {
    visibilityState: visible ? 'visible' : 'hidden',
    addEventListener(type: string, callback: (event: Event) => void) {
      const callbacks = handlers.get(type) ?? new Set();
      callbacks.add(callback);
      handlers.set(type, callbacks);
    },
    removeEventListener(type: string, callback: (event: Event) => void) {
      handlers.get(type)?.delete(callback);
    },
  };
  vi.stubGlobal('document', doc);
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Safari', webdriver: false });
  return {
    doc,
    emit(type: string, isTrusted = true) {
      for (const callback of [...(handlers.get(type) ?? [])]) callback({ isTrusted } as Event);
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('analytics engagement', () => {
  it('requires a trusted interaction and releases pending work once', () => {
    const { emit } = browser();
    const callback = vi.fn();
    afterAnalyticsEngagement(callback);
    emit('pointerdown', false);
    expect(callback).not.toHaveBeenCalled();
    emit('pointerdown');
    emit('click');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it.each(['keydown', 'touchstart', 'wheel', 'click'])(
    'accepts trusted %s activity for keyboard, touch and assistive input',
    (type) => {
      const { emit } = browser();
      const callback = vi.fn();
      afterAnalyticsEngagement(callback);
      emit(type);
      expect(callback).toHaveBeenCalledTimes(1);
    },
  );

  it('requires activity to happen in a visible document', () => {
    const { doc, emit } = browser(false);
    const callback = vi.fn();
    afterAnalyticsEngagement(callback);
    emit('touchstart');
    doc.visibilityState = 'visible';
    emit('visibilitychange');
    expect(callback).not.toHaveBeenCalled();
    emit('touchstart');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('waits for visibility again after the document has engaged', () => {
    const { doc, emit } = browser();
    afterAnalyticsEngagement(() => {});
    emit('pointerdown');
    doc.visibilityState = 'hidden';
    const callback = vi.fn();
    afterAnalyticsEngagement(callback);
    expect(callback).not.toHaveBeenCalled();
    doc.visibilityState = 'visible';
    emit('visibilitychange');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('cancels pending route work and keeps engagement for later calls', () => {
    const { emit } = browser();
    const canceled = vi.fn();
    afterAnalyticsEngagement(canceled)();
    emit('pointerdown');
    expect(canceled).not.toHaveBeenCalled();
    const later = vi.fn();
    afterAnalyticsEngagement(later);
    expect(later).toHaveBeenCalledTimes(1);
  });

  it.each([
    { userAgent: 'Googlebot/2.1', webdriver: false },
    { userAgent: 'Mozilla/5.0 Safari', webdriver: true },
  ])('never registers work for an identified automated client', (navigator) => {
    const { emit } = browser();
    vi.stubGlobal('navigator', navigator);
    const callback = vi.fn();
    afterAnalyticsEngagement(callback);
    emit('pointerdown');
    expect(callback).not.toHaveBeenCalled();
  });

  it('does nothing during server rendering', () => {
    vi.stubGlobal('document', undefined);
    const callback = vi.fn();
    expect(afterAnalyticsEngagement(callback)).toBeTypeOf('function');
    expect(callback).not.toHaveBeenCalled();
  });

  it('remembers trusted input before the first component effect subscribes', async () => {
    const { emit } = browser();
    vi.resetModules();
    const client = await import('./analytics-engagement');
    emit('pointerdown');
    const callback = vi.fn();
    client.afterAnalyticsEngagement(callback);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
