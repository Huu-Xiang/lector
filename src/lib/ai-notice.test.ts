import { describe, expect, it, vi } from 'vitest';
import { createAiNoticeGate, isAiRequest } from './ai-notice';

describe('isAiRequest', () => {
  it('matches the calls that send text to the AI provider', () => {
    expect(isAiRequest('/api/explain', 'POST')).toBe(true);
    expect(isAiRequest('/api/translate', 'POST')).toBe(true);
    expect(isAiRequest('/api/translate/gloss?language=fr', 'POST')).toBe(true);
    expect(isAiRequest('/api/journal/abc-1/correct', 'POST')).toBe(true);
    expect(isAiRequest('/api/review/sentence-translation?language=fr', 'POST')).toBe(true);
    expect(isAiRequest('/api/review/example-sentence', 'POST')).toBe(true);
    expect(isAiRequest('/api/chat', 'POST')).toBe(true);
  });

  it('leaves reads, dictionary lookups, and other calls alone', () => {
    expect(isAiRequest('/api/chat?limit=50', 'GET')).toBe(false);
    expect(isAiRequest('/api/dictionary/cache', 'POST')).toBe(false);
    expect(isAiRequest('/api/vocab', 'POST')).toBe(false);
    expect(isAiRequest('/api/journal/abc-1', 'PUT')).toBe(false);
    expect(isAiRequest('/api/translated', 'POST')).toBe(false);
  });
});

function gate(accepted: string | null, agrees: boolean) {
  const saveAcceptedAt = vi.fn(async () => {});
  const showNotice = vi.fn(async () => agrees);
  const readAcceptedAt = vi.fn(async () => accepted);
  return {
    saveAcceptedAt,
    showNotice,
    readAcceptedAt,
    ensure: createAiNoticeGate({
      readAcceptedAt,
      showNotice,
      saveAcceptedAt,
      now: () => new Date('2026-11-05T12:00:00.000Z'),
    }),
  };
}

describe('createAiNoticeGate', () => {
  it('shows the notice once, saves the agreement, and lets later calls through', async () => {
    const g = gate(null, true);
    expect(await g.ensure()).toBe(true);
    expect(await g.ensure()).toBe(true);
    expect(g.showNotice).toHaveBeenCalledTimes(1);
    expect(g.saveAcceptedAt).toHaveBeenCalledWith('2026-11-05T12:00:00.000Z');
  });

  it('skips the notice when the account already agreed', async () => {
    const g = gate('2026-10-01T00:00:00.000Z', true);
    expect(await g.ensure()).toBe(true);
    expect(g.showNotice).not.toHaveBeenCalled();
    expect(g.saveAcceptedAt).not.toHaveBeenCalled();
  });

  it('blocks the call when the user declines, and asks again next time', async () => {
    const g = gate(null, false);
    expect(await g.ensure()).toBe(false);
    expect(await g.ensure()).toBe(false);
    expect(g.showNotice).toHaveBeenCalledTimes(2);
    expect(g.saveAcceptedAt).not.toHaveBeenCalled();
  });

  it('shows one notice for calls that arrive together', async () => {
    const g = gate(null, true);
    const results = await Promise.all([g.ensure(), g.ensure(), g.ensure()]);
    expect(results).toEqual([true, true, true]);
    expect(g.showNotice).toHaveBeenCalledTimes(1);
  });
});
