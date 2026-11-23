import '../test-guard';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db';
import { getLanguageConfig } from '../lib/languages';
import { resetTtsCache } from '../lib/tts-cache';
import app, { isServerTtsConfigured } from './tts';

const originalFetch = globalThis.fetch;
const TTS_ENV_KEYS = [
  'GOOGLE_CLOUD_API_KEY',
  'TTS_CACHE',
  'TTS_PROVIDER',
  'TTS_URL',
  'TTS_API_KEY',
  'TTS_MODEL',
  'TTS_VOICE',
  'TTS_VOICES',
] as const;
const initialEnv: Record<string, string | undefined> = Object.fromEntries(
  TTS_ENV_KEYS.map((key) => [key, process.env[key]]),
);
const cacheRoot = path.join(process.env.DATA_DIR || '../data', 'tts-cache');

function ttsUsage(): number | null {
  const row = db
    .prepare(
      "SELECT value FROM usage_counters WHERE userId = 'local' AND metric = 'ttsCharsPerMonth'",
    )
    .get() as { value: number } | undefined;
  return row?.value ?? null;
}

beforeEach(() => {
  for (const key of TTS_ENV_KEYS) {
    delete process.env[key];
  }
  process.env.GOOGLE_CLOUD_API_KEY = 'google-test-key';
  fs.rmSync(cacheRoot, { recursive: true, force: true });
  resetTtsCache();
  db.prepare(
    "DELETE FROM usage_counters WHERE userId = 'local' AND metric = 'ttsCharsPerMonth'",
  ).run();
  db.prepare("DELETE FROM settings WHERE userId = 'local' AND key = 'targetLanguage'").run();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  db.prepare("DELETE FROM settings WHERE userId = 'local' AND key = 'targetLanguage'").run();
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  for (const key of TTS_ENV_KEYS) {
    if (initialEnv[key] === undefined) delete process.env[key];
    else process.env[key] = initialEnv[key];
  }
  fs.rmSync(cacheRoot, { recursive: true, force: true });
  resetTtsCache();
});

describe('TTS route request boundaries', () => {
  test('returns 413 before provider fetch or usage reservation for an oversized body', async () => {
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls++;
      throw new Error('oversized TTS bodies must not reach Google');
    }) as unknown as typeof fetch;

    const response = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hello', padding: 'x'.repeat(33 * 1024) }),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: 'TTS request is too large',
      fallback: true,
    });
    expect(fetchCalls).toBe(0);
    expect(ttsUsage()).toBeNull();
  });

  test("rejects text beyond Google's 5,000-byte content limit before fetch or metering", async () => {
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls++;
      throw new Error('over-limit TTS text must not reach Google');
    }) as unknown as typeof fetch;

    // 2,501 two-byte UTF-8 characters = 5,002 bytes despite only 2,501 JS chars.
    const response = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'é'.repeat(2_501) }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Text is too long (max 5,000 bytes)',
      fallback: true,
    });
    expect(fetchCalls).toBe(0);
    expect(ttsUsage()).toBeNull();
  });

  test('accepts exactly 5,000 UTF-8 bytes and preserves character metering', async () => {
    const captured: { request: Request | null } = { request: null };
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      captured.request = new Request(input, init);
      return Response.json({ audioContent: 'encoded-audio' });
    }) as unknown as typeof fetch;

    const text = 'é'.repeat(2_500);
    const response = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      audioContent: 'encoded-audio',
      contentType: 'audio/mp3',
    });
    expect(captured.request?.url).toContain(
      'https://texttospeech.googleapis.com/v1/text:synthesize?key=google-test-key',
    );
    expect(JSON.parse((await captured.request?.text()) ?? '{}').input.text).toBe(text);
    expect(ttsUsage()).toBe(2_500);
  });

  test('resolves an omitted language from settings and clamps the speaking rate', async () => {
    db.prepare('INSERT INTO settings (userId, key, value) VALUES (?, ?, ?)').run(
      'local',
      'targetLanguage',
      '"de"',
    );
    const captured: { request: Request | null } = { request: null };
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      captured.request = new Request(input, init);
      return Response.json({ audioContent: 'ZGV1dHNjaA==' });
    }) as unknown as typeof fetch;

    const response = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'sprachroute', rate: 99 }),
    });
    const requestBody = JSON.parse((await captured.request?.text()) ?? '{}');
    const german = getLanguageConfig('de');

    expect(response.status).toBe(200);
    expect(requestBody.voice).toMatchObject({
      languageCode: german.ttsCode,
      name: german.ttsVoice,
    });
    expect(requestBody.audioConfig.speakingRate).toBe(4);
  });

  test('refunds usage when the provider returns no audio content', async () => {
    globalThis.fetch = (async () => Response.json({})) as unknown as typeof fetch;

    const response = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'missing-audio-route' }),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'No audio content returned',
      fallback: true,
    });
    expect(ttsUsage()).toBe(0);
  });
});

describe('TTS caching (#226)', () => {
  const synthesize = (text: string) =>
    app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

  test('replays of the same tuple are served from cache: one Google call, metered once', async () => {
    delete process.env.TTS_CACHE;
    resetTtsCache();
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls++;
      return Response.json({ audioContent: 'Y2FjaGVkLWF1ZGlv' }); // "cached-audio"
    }) as unknown as typeof fetch;

    const first = await synthesize('kandelaar');
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      audioContent: 'Y2FjaGVkLWF1ZGlv',
      contentType: 'audio/mp3',
    });
    expect(fetchCalls).toBe(1);
    expect(ttsUsage()).toBe('kandelaar'.length);

    // The replay must not need the Google key at all — drop it to prove the
    // request never leaves the cache.
    delete process.env.GOOGLE_CLOUD_API_KEY;
    const second = await synthesize('kandelaar');
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({
      audioContent: 'Y2FjaGVkLWF1ZGlv',
      contentType: 'audio/mp3',
      cached: true,
    });
    expect(fetchCalls).toBe(1);
    expect(ttsUsage()).toBe('kandelaar'.length);
  });

  test('failed synthesis is not cached and the retry re-fetches', async () => {
    delete process.env.TTS_CACHE;
    resetTtsCache();
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls++;
      if (fetchCalls === 1) {
        return Response.json({ error: { message: 'boom' } }, { status: 500 });
      }
      return Response.json({ audioContent: 'aGVyc3RlbA==' });
    }) as unknown as typeof fetch;

    const failed = await synthesize('herstelbaar');
    expect(failed.status).toBe(500);
    expect(ttsUsage()).toBe(0); // reserved, then refunded

    const retried = await synthesize('herstelbaar');
    expect(retried.status).toBe(200);
    expect(await retried.json()).toEqual({
      audioContent: 'aGVyc3RlbA==',
      contentType: 'audio/mp3',
    });
    expect(fetchCalls).toBe(2);
  });

  test('TTS_CACHE=0 keeps every request on the synthesis path', async () => {
    process.env.TTS_CACHE = '0';
    resetTtsCache();
    try {
      let fetchCalls = 0;
      globalThis.fetch = (async () => {
        fetchCalls++;
        return Response.json({ audioContent: 'b25nZWNhY2hl' });
      }) as unknown as typeof fetch;

      expect((await synthesize('ongecached')).status).toBe(200);
      expect((await synthesize('ongecached')).status).toBe(200);
      expect(fetchCalls).toBe(2);
      expect(ttsUsage()).toBe('ongecached'.length * 2);
    } finally {
      delete process.env.TTS_CACHE;
      resetTtsCache();
    }
  });
});

// eSpeak NG engine branch (#307 §3.2c) — Esperanto's only voice, synthesized
// through the real binary. Skipped when espeak-ng isn't installed locally;
// CI installs it (see .github/workflows/ci.yml api-tests) so the branch is
// always exercised there, and the production image bakes it in (Dockerfile
// runner stage).
const hasEspeak = Bun.which('espeak-ng') !== null;

describe.skipIf(!hasEspeak)('TTS espeak engine (#307)', () => {
  test('eo synthesizes WAV via espeak-ng — no Google call, no key, no metering', async () => {
    delete process.env.GOOGLE_CLOUD_API_KEY; // espeak must not need it
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls++;
      throw new Error('espeak languages must never reach Google');
    }) as unknown as typeof fetch;

    const response = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Saluton, kiel vi fartas?', language: 'eo' }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { audioContent: string; contentType: string };
    expect(data.contentType).toBe('audio/wav');
    // Real synthesis: decodes to a RIFF/WAVE container with actual audio in it.
    const wav = Buffer.from(data.audioContent, 'base64');
    expect(wav.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(wav.subarray(8, 12).toString('ascii')).toBe('WAVE');
    expect(wav.byteLength).toBeGreaterThan(1_000);

    expect(fetchCalls).toBe(0);
    // Unmetered on every tier — synthesis is zero-marginal-cost (#307 §3.2c).
    expect(ttsUsage()).toBeNull();
  });

  test('the espeak rate maps the client multiplier onto words-per-minute', async () => {
    // 0.5× of 175 wpm ≈ 88 wpm vs 1.5× ≈ 263 wpm: the slow clip must carry
    // more samples for the same sentence. Compare real output sizes.
    const synth = async (rate: number) => {
      const res = await app.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'La ĝardeno estas bela kaj granda', language: 'eo', rate }),
      });
      expect(res.status).toBe(200);
      const { audioContent } = (await res.json()) as { audioContent: string };
      return Buffer.from(audioContent, 'base64').byteLength;
    };

    const slow = await synth(0.5);
    const fast = await synth(1.5);
    expect(slow).toBeGreaterThan(fast);
  });

  test('an espeak-only language resolves from settings like any other', async () => {
    db.prepare('INSERT INTO settings (userId, key, value) VALUES (?, ?, ?)').run(
      'local',
      'targetLanguage',
      '"eo"',
    );

    const response = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'bonan tagon' }), // language omitted → settings
    });

    expect(response.status).toBe(200);
    expect(((await response.json()) as { contentType: string }).contentType).toBe('audio/wav');
  });
});

const ID3_MP3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const SYNC_MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 0x00, 0x00]);

function mp3Response(
  bytes: Uint8Array<ArrayBuffer> = ID3_MP3,
  contentType = 'audio/mpeg',
  status = 200,
): Response {
  return new Response(bytes, {
    status,
    headers: { 'Content-Type': contentType },
  });
}

describe('OpenAI-compatible TTS provider (TTS_PROVIDER=openai)', () => {
  const postTts = (body: Record<string, unknown>) =>
    app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  test('AE7: keyless local server posts to <TTS_URL>/v1/audio/speech, validates MP3, caches, and isolates from Google', async () => {
    delete process.env.GOOGLE_CLOUD_API_KEY;
    process.env.TTS_PROVIDER = 'openai';
    process.env.TTS_URL = 'http://kokoro:8880/kokoro';
    process.env.TTS_MODEL = 'kokoro';
    process.env.TTS_VOICE = 'af_heart';

    let fetchCalls = 0;
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    let capturedRequest: Request | null = null;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls++;
      capturedUrl = String(input);
      capturedInit = init;
      capturedRequest = new Request(input, init);
      return mp3Response(ID3_MP3, 'audio/mpeg');
    }) as unknown as typeof fetch;

    const first = await postTts({ text: 'Bonjour', language: 'fr', rate: 1.0 });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      audioContent: Buffer.from(ID3_MP3).toString('base64'),
      contentType: 'audio/mp3',
    });
    expect(fetchCalls).toBe(1);
    expect(capturedUrl).toBe('http://kokoro:8880/kokoro/v1/audio/speech');
    expect(capturedRequest!.headers.has('authorization')).toBe(false);
    expect(capturedInit?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(await capturedRequest!.text())).toEqual({
      model: 'kokoro',
      input: 'Bonjour',
      voice: 'af_heart',
      response_format: 'mp3',
      speed: 1,
    });
    expect(ttsUsage()).toBe('Bonjour'.length);

    // Replay hits cache without calling upstream or re-metering.
    const second = await postTts({ text: 'Bonjour', language: 'fr', rate: 1.0 });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({
      audioContent: Buffer.from(ID3_MP3).toString('base64'),
      contentType: 'audio/mp3',
      cached: true,
    });
    expect(fetchCalls).toBe(1);
    expect(ttsUsage()).toBe('Bonjour'.length);

    // Switching back to Google for the same tuple must NOT hit the OpenAI cache.
    process.env.TTS_PROVIDER = 'google';
    process.env.GOOGLE_CLOUD_API_KEY = 'google-test-key';
    let googleCalls = 0;
    globalThis.fetch = (async () => {
      googleCalls++;
      return Response.json({ audioContent: 'Z29vZ2xl' });
    }) as unknown as typeof fetch;

    const googleRes = await postTts({ text: 'Bonjour', language: 'fr', rate: 1.0 });
    expect(googleRes.status).toBe(200);
    expect(await googleRes.json()).toEqual({
      audioContent: 'Z29vZ2xl',
      contentType: 'audio/mp3',
    });
    expect(googleCalls).toBe(1);
  });

  test('accepts application/octet-stream with MPEG frame-sync magic bytes', async () => {
    process.env.TTS_PROVIDER = 'openai';
    process.env.TTS_URL = 'http://kokoro:8880';
    globalThis.fetch = (async () =>
      mp3Response(SYNC_MP3, 'application/octet-stream')) as unknown as typeof fetch;

    const res = await postTts({ text: 'Hallo', language: 'de', rate: 1.0 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      audioContent: Buffer.from(SYNC_MP3).toString('base64'),
      contentType: 'audio/mp3',
    });
  });

  test('normalizes trailing slashes and /v1 without producing /v1/v1/ and isolates distinct path prefixes in cache', async () => {
    process.env.TTS_PROVIDER = 'openai';
    process.env.TTS_URL = 'http://kokoro:8880/kokoro/v1/';
    process.env.TTS_MODEL = 'kokoro';
    process.env.TTS_VOICE = 'af_heart';

    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return mp3Response(ID3_MP3);
    }) as unknown as typeof fetch;

    const res1 = await postTts({ text: 'Salut', language: 'fr', rate: 1.0 });
    expect(res1.status).toBe(200);
    expect(urls).toEqual(['http://kokoro:8880/kokoro/v1/audio/speech']);

    // Equivalent URL without /v1/ hits the same cache entry.
    process.env.TTS_URL = 'http://kokoro:8880/kokoro';
    const res2 = await postTts({ text: 'Salut', language: 'fr', rate: 1.0 });
    expect(res2.status).toBe(200);
    expect((await res2.json()).cached).toBe(true);
    expect(urls).toHaveLength(1);

    // Different path prefix misses cache and posts to /edge/v1/audio/speech.
    process.env.TTS_URL = 'http://kokoro:8880/edge/v1/';
    const res3 = await postTts({ text: 'Salut', language: 'fr', rate: 1.0 });
    expect(res3.status).toBe(200);
    expect((await res3.json()).cached).toBeUndefined();
    expect(urls).toEqual([
      'http://kokoro:8880/kokoro/v1/audio/speech',
      'http://kokoro:8880/edge/v1/audio/speech',
    ]);
  });

  test('honors keyless cache replay on default OpenAI URL and uses redirect: manual when TTS_API_KEY is set', async () => {
    delete process.env.GOOGLE_CLOUD_API_KEY;
    process.env.TTS_PROVIDER = 'openai';
    process.env.TTS_API_KEY = 'sk-openai-secret';

    let fetchCalls = 0;
    const captured: {
      url: string;
      init: RequestInit | undefined;
      auth: string | null;
    } = { url: '', init: undefined, auth: null };
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls++;
      captured.url = String(input);
      captured.init = init;
      captured.auth = new Request(input, init).headers.get('authorization');
      return mp3Response(ID3_MP3);
    }) as unknown as typeof fetch;

    const first = await postTts({ text: 'Replay me', language: 'en', rate: 1.0 });
    expect(first.status).toBe(200);
    expect(captured.url).toBe('https://api.openai.com/v1/audio/speech');
    expect(captured.auth).toBe('Bearer sk-openai-secret');
    expect(captured.init?.redirect).toBe('manual');
    expect(fetchCalls).toBe(1);

    // Drop TTS_API_KEY (and keep TTS_URL unset): cached clip still replays 200.
    delete process.env.TTS_API_KEY;
    const replay = await postTts({ text: 'Replay me', language: 'en', rate: 1.0 });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({
      audioContent: Buffer.from(ID3_MP3).toString('base64'),
      contentType: 'audio/mp3',
      cached: true,
    });
    expect(fetchCalls).toBe(1);

    // Cache miss without TTS_URL or TTS_API_KEY returns sanitized 503 without fetching.
    const miss = await postTts({ text: 'Uncached text', language: 'en', rate: 1.0 });
    expect(miss.status).toBe(503);
    expect(await miss.json()).toEqual({ error: 'TTS service unavailable', fallback: true });
    expect(fetchCalls).toBe(1);
  });

  test('resolves per-language TTS_VOICES and falls back cleanly on malformed JSON', async () => {
    process.env.TTS_PROVIDER = 'openai';
    process.env.TTS_URL = 'http://kokoro:8880';
    process.env.TTS_VOICE = 'af_heart';
    process.env.TTS_VOICES = JSON.stringify({ fr: 'ff_siwis', de: 'dm_hans' });

    const seenVoices: string[] = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body ?? '{}'));
      seenVoices.push(payload.voice);
      return mp3Response(ID3_MP3);
    }) as unknown as typeof fetch;

    expect((await postTts({ text: 'Un', language: 'fr' })).status).toBe(200);
    expect((await postTts({ text: 'Uno', language: 'es' })).status).toBe(200);

    process.env.TTS_VOICES = '{not valid json';
    expect((await postTts({ text: 'Deux', language: 'fr' })).status).toBe(200);

    expect(seenVoices).toEqual(['ff_siwis', 'af_heart', 'af_heart']);
  });

  test('guards non-finite or non-numeric rate back to 0.9', async () => {
    process.env.TTS_PROVIDER = 'openai';
    process.env.TTS_URL = 'http://kokoro:8880';

    let seenSpeed: unknown;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seenSpeed = JSON.parse(String(init?.body ?? '{}')).speed;
      return mp3Response(ID3_MP3);
    }) as unknown as typeof fetch;

    const res = await postTts({ text: 'Rate guard', language: 'en', rate: 'fast' });
    expect(res.status).toBe(200);
    expect(seenSpeed).toBe(0.9);
  });

  test('rejects invalid TTS_URL (embedded userinfo, non-http scheme, malformed) with 503 before fetch', async () => {
    process.env.TTS_PROVIDER = 'openai';
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls++;
      return mp3Response(ID3_MP3);
    }) as unknown as typeof fetch;

    for (const badUrl of [
      'http://user:pass@kokoro:8880/kokoro',
      'https://user@kokoro:8880',
      'ftp://kokoro:8880/kokoro',
      'file:///etc/passwd',
      'not a valid url',
    ]) {
      process.env.TTS_URL = badUrl;
      const res = await postTts({ text: 'Bad url test', language: 'en' });
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: 'TTS service unavailable', fallback: true });
    }
    expect(fetchCalls).toBe(0);
    expect(ttsUsage()).toBeNull();
  });

  test('sanitizes upstream 401/402/500/302 and timeout failures, refunds usage, and caches nothing', async () => {
    process.env.TTS_PROVIDER = 'openai';
    process.env.TTS_URL = 'http://kokoro:8880';
    process.env.TTS_API_KEY = 'sk-secret';

    const failures: Array<() => Promise<Response>> = [
      async () =>
        Response.json({ error: { message: 'Invalid API key sk-secret' } }, { status: 401 }),
      async () => Response.json({ error: { message: 'Quota exceeded' } }, { status: 402 }),
      async () => new Response('upstream stack trace', { status: 500 }),
      async () =>
        new Response(null, { status: 302, headers: { Location: 'https://attacker.example/' } }),
      async () => {
        throw new DOMException('The operation timed out.', 'TimeoutError');
      },
    ];

    for (let i = 0; i < failures.length; i++) {
      let calls = 0;
      globalThis.fetch = (async () => {
        calls++;
        return failures[i]();
      }) as unknown as typeof fetch;

      const text = `fail-case-${i}`;
      const res = await postTts({ text, language: 'en' });
      expect([502, 503]).toContain(res.status);
      expect(await res.json()).toEqual({ error: 'TTS service unavailable', fallback: true });
      expect(ttsUsage()).toBe(0);

      // Verify nothing was cached by succeeding on retry.
      globalThis.fetch = (async () => {
        calls++;
        return mp3Response(ID3_MP3);
      }) as unknown as typeof fetch;
      const retry = await postTts({ text, language: 'en' });
      expect(retry.status).toBe(200);
      expect((await retry.json()).cached).toBeUndefined();
      expect(calls).toBe(2);
      db.prepare(
        "DELETE FROM usage_counters WHERE userId = 'local' AND metric = 'ttsCharsPerMonth'",
      ).run();
    }
  });

  test('rejects HTML 200, non-MP3 bytes, empty body, and >10 MiB body with refund and no cache write', async () => {
    process.env.TTS_PROVIDER = 'openai';
    process.env.TTS_URL = 'http://kokoro:8880';

    const oversized = new Uint8Array(10 * 1024 * 1024 + 1);
    oversized[0] = 0x49;
    oversized[1] = 0x44;
    oversized[2] = 0x33;

    const badResponses: Array<() => Response> = [
      () => new Response('<html><body>error</body></html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
      () =>
        new Response(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00]), {
          status: 200,
          headers: { 'Content-Type': 'audio/mpeg' },
        }),
      () => new Response(new Uint8Array(0), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } }),
      () => new Response(oversized, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } }),
    ];

    for (let i = 0; i < badResponses.length; i++) {
      let calls = 0;
      globalThis.fetch = (async () => {
        calls++;
        return badResponses[i]();
      }) as unknown as typeof fetch;

      const text = `bad-body-${i}`;
      const res = await postTts({ text, language: 'en' });
      expect([502, 503]).toContain(res.status);
      expect(await res.json()).toEqual({ error: 'TTS service unavailable', fallback: true });
      expect(ttsUsage()).toBe(0);

      // Must not be cached — retry hits upstream again.
      globalThis.fetch = (async () => {
        calls++;
        return mp3Response(SYNC_MP3);
      }) as unknown as typeof fetch;
      const retry = await postTts({ text, language: 'en' });
      expect(retry.status).toBe(200);
      expect((await retry.json()).cached).toBeUndefined();
      expect(calls).toBe(2);
      db.prepare(
        "DELETE FROM usage_counters WHERE userId = 'local' AND metric = 'ttsCharsPerMonth'",
      ).run();
    }
  });

  test('rejects unknown TTS_PROVIDER with 503 and preserves audio:none (404) and eo espeak dispatch', async () => {
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls++;
      return mp3Response(ID3_MP3);
    }) as unknown as typeof fetch;

    process.env.TTS_PROVIDER = 'typo';
    const invalidRes = await postTts({ text: 'Hello', language: 'en' });
    expect(invalidRes.status).toBe(503);
    expect(await invalidRes.json()).toEqual({ error: 'TTS service unavailable', fallback: true });

    // Latin (audio: 'none') still returns 404 noAudio even under TTS_PROVIDER=openai.
    process.env.TTS_PROVIDER = 'openai';
    process.env.TTS_URL = 'http://kokoro:8880';
    const noneRes = await postTts({ text: 'Salve', language: 'la' });
    expect(noneRes.status).toBe(404);
    expect(await noneRes.json()).toEqual({
      error: 'This language has no synthesized voice',
      noAudio: true,
    });

    // Esperanto (espeak) never calls the OpenAI HTTP endpoint.
    await postTts({ text: 'Saluton', language: 'eo' });
    expect(fetchCalls).toBe(0);
  });
});

describe('isServerTtsConfigured', () => {
  test('recognizes valid Google and OpenAI-compatible TTS configurations and rejects invalid ones', () => {
    expect(isServerTtsConfigured({ GOOGLE_CLOUD_API_KEY: 'g-key' })).toBe(true);
    expect(isServerTtsConfigured({ TTS_PROVIDER: 'google', GOOGLE_CLOUD_API_KEY: 'g-key' })).toBe(
      true,
    );
    expect(isServerTtsConfigured({})).toBe(false);
    expect(isServerTtsConfigured({ TTS_PROVIDER: 'openai', TTS_URL: 'http://kokoro:8880/kokoro' })).toBe(
      true,
    );
    expect(isServerTtsConfigured({ TTS_PROVIDER: 'openai', TTS_API_KEY: 'sk-test' })).toBe(true);
    expect(isServerTtsConfigured({ TTS_PROVIDER: 'openai' })).toBe(false);
    expect(
      isServerTtsConfigured({
        TTS_PROVIDER: 'openai',
        TTS_URL: 'http://user:pass@kokoro:8880',
        TTS_API_KEY: 'sk-test',
      }),
    ).toBe(false);
    expect(
      isServerTtsConfigured({
        TTS_PROVIDER: 'openai',
        TTS_URL: 'ftp://kokoro:8880',
      }),
    ).toBe(false);
    expect(
      isServerTtsConfigured({
        TTS_PROVIDER: 'typo',
        GOOGLE_CLOUD_API_KEY: 'g-key',
      }),
    ).toBe(false);
  });
});
