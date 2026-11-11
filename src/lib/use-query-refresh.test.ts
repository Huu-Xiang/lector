import { describe, expect, it, vi } from 'vitest';
import { QUERY_UPDATED_EVENT } from './query-cache';
import { subscribeToQueryUpdates } from './use-query-refresh';

function update(scope: string, tenant: string) {
  return new CustomEvent(QUERY_UPDATED_EVENT, { detail: { scope, tenant } });
}

describe('subscribeToQueryUpdates', () => {
  it('re-runs the load once for an update to a subscribed scope of the active user', () => {
    const target = new EventTarget();
    const onUpdate = vi.fn();
    subscribeToQueryUpdates(['collections', 'groups'], onUpdate, target, () => 'u1');

    target.dispatchEvent(update('groups', 'u1'));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('ignores other scopes and other users', () => {
    const target = new EventTarget();
    const onUpdate = vi.fn();
    subscribeToQueryUpdates(['collections'], onUpdate, target, () => 'u1');

    target.dispatchEvent(update('vocab', 'u1'));
    target.dispatchEvent(update('collections', 'u2'));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('stops listening after cleanup', () => {
    const target = new EventTarget();
    const onUpdate = vi.fn();
    const stop = subscribeToQueryUpdates(['collections'], onUpdate, target, () => 'u1');
    stop();
    target.dispatchEvent(update('collections', 'u1'));
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
