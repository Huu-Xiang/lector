import { describe, expect, test } from 'bun:test';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { prewarmOnce, prewarmUrl, startLlmPrewarm } from './prewarm';

describe('prewarm', () => {
  test('builds the models URL without a key in it', () => {
    expect(prewarmUrl({ OPENAI_COMPAT_URL: 'https://x.test/compatible-mode/' })).toBe(
      'https://x.test/compatible-mode/v1/models',
    );
    expect(prewarmUrl({})).toBeNull();
  });

  test('sends the key as a header and counts any answer as warm', async () => {
    let seen: { url: string; auth: string | null } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, auth: new Headers(init.headers).get('authorization') };
      return new Response('nope', { status: 404 });
    }) as unknown as typeof fetch;
    const ok = await prewarmOnce(
      { OPENAI_COMPAT_URL: 'https://x.test', OPENAI_COMPAT_API_KEY: 'k' },
      fake,
    );
    expect(ok).toBe(true);
    expect(JSON.stringify(seen)).toBe(
      JSON.stringify({ url: 'https://x.test/v1/models', auth: 'Bearer k' }),
    );
  });

  test('reports failure on a network error', async () => {
    const fake = (async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    expect(await prewarmOnce({ OPENAI_COMPAT_URL: 'https://x.test' }, fake)).toBe(false);
  });

  test('stays off unless LLM_PREWARM=1', () => {
    expect(startLlmPrewarm({ OPENAI_COMPAT_URL: 'https://x.test' })).toBeNull();
  });

  test('prewarmOnce twice plus a normal fetch share one connection', async () => {
    const local = await localServer((_req, res) => res.end('{"data":[]}'));
    try {
      const env = { OPENAI_COMPAT_URL: local.url };
      expect(await prewarmOnce(env)).toBe(true);
      expect(await prewarmOnce(env)).toBe(true);
      await (await fetch(`${local.url}/v1/models`)).text();
      expect(local.connections()).toBe(1);
    } finally {
      local.close();
    }
  });

  test('a server that never answers resolves false at the timeout', async () => {
    const local = await localServer(() => {});
    try {
      const started = Date.now();
      expect(await prewarmOnce({ OPENAI_COMPAT_URL: local.url }, fetch, 50)).toBe(false);
      expect(Date.now() - started).toBeLessThan(2_000);
    } finally {
      local.close();
    }
  });
});

describe('startLlmPrewarm enabled', () => {
  test('returns null without OPENAI_COMPAT_URL', () => {
    expect(startLlmPrewarm({ LLM_PREWARM: '1' })).toBeNull();
  });

  test('pings at once, again on the interval, and stops', async () => {
    const local = await localServer((_req, res) => res.end('{}'));
    try {
      const stop = startLlmPrewarm(
        { LLM_PREWARM: '1', OPENAI_COMPAT_URL: local.url, OPENAI_COMPAT_API_KEY: 'k' },
        40,
      );
      expect(stop).not.toBeNull();
      await waitFor(() => local.requests.length >= 1);
      expect(local.requests[0]).toEqual({
        method: 'GET',
        url: '/v1/models',
        auth: 'Bearer k',
      });
      await waitFor(() => local.requests.length >= 3);
      stop?.();
      await new Promise((r) => setTimeout(r, 30));
      const after = local.requests.length;
      await new Promise((r) => setTimeout(r, 120));
      expect(local.requests.length).toBe(after);
    } finally {
      local.close();
    }
  });
});

async function waitFor(check: () => boolean, ms = 2_000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function localServer(handler: Parameters<typeof createServer>[1]) {
  let connections = 0;
  const requests: { method?: string; url?: string; auth?: string }[] = [];
  const server = createServer((req: IncomingMessage, res) => {
    requests.push({ method: req.method, url: req.url, auth: req.headers.authorization });
    handler!(req, res);
  });
  server.on('connection', () => connections++);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    requests,
    connections: () => connections,
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}
