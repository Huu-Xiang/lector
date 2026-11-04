import { describe, expect, it, vi } from 'vitest';
import { subscribeToReturn } from './use-refresh-on-return';

function fakeTargets() {
  const doc = new EventTarget() as EventTarget & { visibilityState: string };
  doc.visibilityState = 'visible';
  return { doc, win: new EventTarget() };
}

describe('subscribeToReturn', () => {
  it('calls back when the tab becomes visible again', () => {
    const { doc, win } = fakeTargets();
    const cb = vi.fn();
    subscribeToReturn(cb, doc, win);
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does not call back when the tab becomes hidden', () => {
    const { doc, win } = fakeTargets();
    const cb = vi.fn();
    subscribeToReturn(cb, doc, win);
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(cb).not.toHaveBeenCalled();
  });

  it('calls back when the window regains focus', () => {
    const { doc, win } = fakeTargets();
    const cb = vi.fn();
    subscribeToReturn(cb, doc, win);
    win.dispatchEvent(new Event('focus'));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does not poll while the tab stays visible', () => {
    const { doc, win } = fakeTargets();
    const cb = vi.fn();
    subscribeToReturn(cb, doc, win);
    expect(cb).not.toHaveBeenCalled();
  });

  it('stops after unsubscribe', () => {
    const { doc, win } = fakeTargets();
    const cb = vi.fn();
    const off = subscribeToReturn(cb, doc, win);
    off();
    doc.dispatchEvent(new Event('visibilitychange'));
    win.dispatchEvent(new Event('focus'));
    expect(cb).not.toHaveBeenCalled();
  });
});
