import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.fn();

vi.mock('./api-base', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  hasAiRequestGuard: () => false,
}));
vi.mock('./data-layer', () => ({
  getActiveLanguage: () => 'fr',
  getActivePack: () => undefined,
}));
vi.mock('./languages', () => ({
  foldWord: (word: string) => word.toLowerCase(),
}));

import {
  localizeEntrySenses,
  prefetchLocalizedSenses,
  resetPrefetchState,
} from './dictionary-client';

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

const SENSES = [{ partOfSpeech: 'noun', gloss: '孩子' }];

beforeEach(() => {
  apiFetch.mockReset();
  resetPrefetchState();
});

describe('lesson prefetch client', () => {
  it('serves a tap from the prefetched cache without a localize call', async () => {
    apiFetch.mockResolvedValueOnce(json({ senses: { gamin: SENSES } }));
    await prefetchLocalizedSenses(['gamin'], 'zh-CN');
    expect(await localizeEntrySenses('gamin', 'zh-CN')).toEqual(SENSES);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('makes a tap on a word being prefetched wait for that request', async () => {
    let finish: (res: Response) => void = () => {};
    apiFetch.mockImplementationOnce(() => new Promise<Response>((resolve) => (finish = resolve)));
    const prefetching = prefetchLocalizedSenses(['gamin'], 'zh-CN');
    const tap = localizeEntrySenses('gamin', 'zh-CN');
    finish(json({ senses: { gamin: SENSES } }));
    await prefetching;
    expect(await tap).toEqual(SENSES);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to /localize when the prefetch had no answer for the word', async () => {
    apiFetch
      .mockResolvedValueOnce(json({ senses: {} }))
      .mockResolvedValueOnce(json({ senses: SENSES }));
    const prefetching = prefetchLocalizedSenses(['gamin'], 'zh-CN');
    const tap = localizeEntrySenses('gamin', 'zh-CN');
    await prefetching;
    expect(await tap).toEqual(SENSES);
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(apiFetch.mock.calls[1][0]).toBe('/api/translate/localize');
  });

  it('does not send a word that is already in flight or cached', async () => {
    let finish: (res: Response) => void = () => {};
    apiFetch.mockImplementationOnce(() => new Promise<Response>((resolve) => (finish = resolve)));
    const first = prefetchLocalizedSenses(['gamin'], 'zh-CN');
    await prefetchLocalizedSenses(['gamin'], 'zh-CN');
    finish(json({ senses: { gamin: SENSES } }));
    await first;
    await prefetchLocalizedSenses(['gamin'], 'zh-CN');
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('keeps at most 500 prefetched words and drops the oldest', async () => {
    const words = Array.from({ length: 501 }, (_, i) => `mot${i}`);
    apiFetch.mockResolvedValueOnce(
      json({ senses: Object.fromEntries(words.map((w) => [w, SENSES])) }),
    );
    await prefetchLocalizedSenses(words, 'zh-CN');
    apiFetch.mockResolvedValueOnce(json({ senses: null }));
    expect(await localizeEntrySenses('mot500', 'zh-CN')).toEqual(SENSES);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(await localizeEntrySenses('mot0', 'zh-CN')).toBeNull();
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});
