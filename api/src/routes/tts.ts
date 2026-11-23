import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { resolveLanguage } from '../lib/active-language';
import { getCurrentUserId } from '../lib/user';
import { getLanguageConfig } from '../lib/languages';
import { entitlements, planLimitResponse, type UsageReservation } from '../lib/entitlements';
import { readBodyCapped } from '../lib/safe-fetch';
import { getTtsCache, ttsCacheKey } from '../lib/tts-cache';

const GOOGLE_TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const DEFAULT_OPENAI_TTS_URL = 'https://api.openai.com';
const DEFAULT_OPENAI_TTS_MODEL = 'tts-1';
const DEFAULT_OPENAI_TTS_VOICE = 'alloy';
const OPENAI_TTS_TIMEOUT_MS = 30_000;
const MAX_OPENAI_TTS_RESPONSE_BYTES = 10 * 1024 * 1024;
const MAX_OPENAI_TTS_ERROR_BYTES = 4096;

const MAX_TTS_BODY_BYTES = 32 * 1024;
// Google Cloud TTS caps SynthesisInput content at 5,000 UTF-8 bytes. Reject
// locally before reserving quota or paying for an upstream request.
const MAX_TTS_TEXT_BYTES = 5_000;

// eSpeak NG's default speaking rate is 175 words-per-minute; the client's
// rate multiplier maps onto it (app default 0.9× ≈ 158 wpm), clamped to
// espeak's sensible range.
const ESPEAK_BASE_WPM = 175;
const ESPEAK_MIN_WPM = 80;
const ESPEAK_MAX_WPM = 450;

type TtsProvider = 'google' | 'openai';

function parseTtsProvider(raw: string | undefined): TtsProvider | null {
  const value = (raw ?? '').trim();
  if (value === '' || value === 'google') return 'google';
  if (value === 'openai') return 'openai';
  return null;
}

/**
 * Validate and normalize an OpenAI-compatible TTS base URL: allow only
 * http(s), reject embedded credentials, strip trailing `/` and a trailing
 * `/v1` segment, and return `origin + pathname` (dropping query/hash so
 * neither the speech endpoint nor cache keys carry extraneous tokens).
 */
function normalizeOpenAiTtsBaseUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password || !url.hostname) return null;
  let pathname = url.pathname.replace(/\/+$/, '');
  if (pathname === '/v1' || pathname.endsWith('/v1')) {
    pathname = pathname.slice(0, -3).replace(/\/+$/, '');
  }
  return `${url.origin}${pathname}`;
}

function resolveOpenAiVoice(lang: string, env: NodeJS.ProcessEnv = process.env): string {
  const fallbackVoice = (env.TTS_VOICE ?? '').trim() || DEFAULT_OPENAI_TTS_VOICE;
  const rawVoices = (env.TTS_VOICES ?? '').trim();
  if (!rawVoices) return fallbackVoice;
  try {
    const parsed: unknown = JSON.parse(rawVoices);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      console.warn('[tts] TTS_VOICES must be a JSON object — falling back to default voice.');
      return fallbackVoice;
    }
    if (Object.hasOwn(parsed, lang)) {
      const mapped = (parsed as Record<string, unknown>)[lang];
      if (typeof mapped === 'string' && mapped.trim().length > 0) {
        return mapped.trim();
      }
    }
  } catch (err) {
    console.warn('[tts] Invalid TTS_VOICES JSON — falling back to default voice:', err);
  }
  return fallbackVoice;
}

function isAllowedAudioContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return (
    (mediaType.startsWith('audio/') && mediaType.length > 'audio/'.length) ||
    mediaType === 'application/octet-stream'
  );
}

function isValidMp3Bytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return true; // ID3v2 header
  }
  if (bytes.byteLength >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return true; // MPEG audio frame sync
  }
  return false;
}

/**
 * Boot-path helper: true when the active TTS_PROVIDER has a valid server-side
 * synthesis configuration (Google Cloud key, or OpenAI-compatible TTS_URL or
 * TTS_API_KEY with a valid URL when set). False for unknown providers or
 * malformed TTS_URL values.
 */
export function isServerTtsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const provider = parseTtsProvider(env.TTS_PROVIDER);
  if (provider === 'google') {
    return Boolean((env.GOOGLE_CLOUD_API_KEY ?? '').trim());
  }
  if (provider === 'openai') {
    const rawUrl = (env.TTS_URL ?? '').trim();
    const apiKey = (env.TTS_API_KEY ?? '').trim();
    if (rawUrl && normalizeOpenAiTtsBaseUrl(rawUrl) === null) return false;
    return Boolean(rawUrl || apiKey);
  }
  return false;
}

interface SynthesizeRequest {
  input: { text: string };
  voice: {
    languageCode: string;
    name?: string;
    ssmlGender?: 'MALE' | 'FEMALE' | 'NEUTRAL';
  };
  audioConfig: {
    audioEncoding: 'MP3' | 'LINEAR16' | 'OGG_OPUS';
    speakingRate?: number;
    pitch?: number;
  };
}

/**
 * Synthesize via self-hosted eSpeak NG (#307 §3.2c) — the only
 * commercially-usable Esperanto TTS, baked into the API image (Dockerfile
 * runner stage `apk add espeak-ng`). Invoked as an arm's-length subprocess:
 * text goes in via stdin (no shell, no argv-length limits), WAV comes out on
 * stdout. No cache, no key, no metering — formant synthesis runs hundreds×
 * realtime on one CPU core, so regenerating is cheaper than storing.
 *
 * eSpeak needs no per-language voice field: its Esperanto voice id is just
 * `eo`, so the pack's `code` serves until some language diverges.
 */
async function synthesizeWithEspeak(text: string, voice: string, rate: number): Promise<string> {
  const wpm = Math.round(
    Math.min(ESPEAK_MAX_WPM, Math.max(ESPEAK_MIN_WPM, ESPEAK_BASE_WPM * rate)),
  );
  const proc = Bun.spawn(
    // -b 1: stdin is UTF-8. --stdin + --stdout: text in, WAV out.
    ['espeak-ng', '-v', voice, '-s', String(wpm), '-b', '1', '--stdin', '--stdout'],
    { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
  );
  proc.stdin.write(text);
  await proc.stdin.end();

  const [wav, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0 || wav.byteLength === 0) {
    throw new Error(
      `espeak-ng exited ${exitCode} with ${wav.byteLength} bytes${stderr ? `: ${stderr.slice(0, 200)}` : ''}`,
    );
  }
  return Buffer.from(wav).toString('base64');
}

const app = new Hono();

// POST /api/tts — synthesize speech, returned as base64. Dispatches on the
// language pack's pronunciation capability (#307 §3.2): Google Cloud TTS for
// the national-language packs, self-hosted eSpeak NG for Esperanto, and an
// explicit no-audio answer for `audio: 'none'` languages (disputed or
// reconstructed pronunciation), which must NOT trigger the client's
// browser-voice fallback.
app.post(
  '/',
  bodyLimit({
    maxSize: MAX_TTS_BODY_BYTES,
    onError: (c) => c.json({ error: 'TTS request is too large', fallback: true }, 413),
  }),
  async (c) => {
    const userId = getCurrentUserId(c);
    let reservation: UsageReservation | null = null;
    let earned = false;
    try {
      const { text, rate = 0.9, language } = await c.req.json();

      if (!text || typeof text !== 'string') {
        return c.json({ error: 'Text is required' }, 400);
      }
      if (new TextEncoder().encode(text).byteLength > MAX_TTS_TEXT_BYTES) {
        return c.json({ error: 'Text is too long (max 5,000 bytes)', fallback: true }, 400);
      }

      const lang = resolveLanguage(language, userId);
      const langConfig = getLanguageConfig(lang);
      const audio = langConfig.pronunciation.audio;

      if (audio === 'none') {
        // No `fallback: true`: nothing should speak this language (#307 §3.2a).
        return c.json({ error: 'This language has no synthesized voice', noAudio: true }, 404);
      }

      // Engine dispatch: packs declare their engines best-first. Today each
      // pack declares a single engine (national languages `['google']`, eo
      // `['espeak']`); the ordered-list form is the seam the §3.2c plan
      // matrix (espeak as the free-tier engine everywhere) later slots into.
      if (!audio.includes('google')) {
        // eSpeak: unmetered on every tier (zero marginal cost — #307 §3.2c)
        // and uncached (regenerating is cheaper than storing). On failure
        // there is deliberately no `fallback: true` — an espeak-only language
        // has no browser voice to fall back to, and mis-speaking in a
        // wrong-language voice is the failure mode this seam exists to kill.
        const rateNum = typeof rate === 'number' && Number.isFinite(rate) ? rate : 0.9;
        try {
          const audioContent = await synthesizeWithEspeak(text, langConfig.code, rateNum);
          return c.json({ audioContent, contentType: 'audio/wav' });
        } catch (err) {
          console.error('eSpeak TTS error:', err);
          return c.json({ error: 'Speech synthesis failed', noAudio: true }, 500);
        }
      }

      const speakingRate =
        typeof rate === 'number' && Number.isFinite(rate)
          ? Math.max(0.25, Math.min(4.0, rate))
          : 0.9;

      const provider = parseTtsProvider(process.env.TTS_PROVIDER);
      if (provider === null) {
        console.error(`Unknown TTS_PROVIDER: "${process.env.TTS_PROVIDER}"`);
        return c.json({ error: 'TTS service unavailable', fallback: true }, 503);
      }

      const cache = getTtsCache();

      if (provider === 'openai') {
        const rawUrl = (process.env.TTS_URL ?? '').trim();
        const baseUrl = rawUrl ? normalizeOpenAiTtsBaseUrl(rawUrl) : DEFAULT_OPENAI_TTS_URL;
        if (!baseUrl) {
          console.error('Invalid TTS_URL configuration for OpenAI-compatible TTS');
          return c.json({ error: 'TTS service unavailable', fallback: true }, 503);
        }

        const apiKey = (process.env.TTS_API_KEY ?? '').trim() || undefined;
        const model = (process.env.TTS_MODEL ?? '').trim() || DEFAULT_OPENAI_TTS_MODEL;
        const voice = resolveOpenAiVoice(lang, process.env);

        // Cache first: checked before the missing-config gate (keyless cache
        // replay) and before usage metering.
        const cacheKey = ttsCacheKey({
          provider: 'openai',
          model,
          language: lang,
          voice: `${baseUrl}:${voice}`,
          rate: speakingRate,
          text,
        });
        const hit = await cache.get(cacheKey);
        if (hit) {
          return c.json({
            audioContent: Buffer.from(hit).toString('base64'),
            contentType: 'audio/mp3',
            cached: true,
          });
        }

        if (!rawUrl && !apiKey) {
          return c.json({ error: 'TTS service unavailable', fallback: true }, 503);
        }

        const ttsVerdict = entitlements.reserve(userId, 'ttsCharsPerMonth', text.length);
        if (!ttsVerdict.allowed) return planLimitResponse(c, ttsVerdict);
        reservation = ttsVerdict.reservation;

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

        let response: Response;
        try {
          response = await fetch(`${baseUrl}/v1/audio/speech`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model,
              input: text,
              voice,
              response_format: 'mp3',
              speed: speakingRate,
            }),
            signal: AbortSignal.timeout(OPENAI_TTS_TIMEOUT_MS),
            redirect: apiKey ? 'manual' : 'follow',
          });
        } catch (err) {
          console.error('OpenAI-compatible TTS fetch error:', err);
          return c.json({ error: 'TTS service unavailable', fallback: true }, 502);
        }

        if (!response.ok) {
          const snippet = await readBodyCapped(response, MAX_OPENAI_TTS_ERROR_BYTES)
            .then((bytes) => new TextDecoder().decode(bytes).slice(0, 500))
            .catch(() => '');
          console.error(`OpenAI-compatible TTS upstream error (${response.status}):`, snippet);
          // Sanitize all upstream failures (never forward 401/402 or raw provider errors).
          return c.json({ error: 'TTS service unavailable', fallback: true }, 502);
        }

        const contentType = response.headers.get('content-type');
        if (!isAllowedAudioContentType(contentType)) {
          await response.body?.cancel().catch(() => {});
          console.error(`OpenAI-compatible TTS returned unexpected content-type: ${contentType}`);
          return c.json({ error: 'TTS service unavailable', fallback: true }, 502);
        }

        let audioBytes: Uint8Array;
        try {
          audioBytes = await readBodyCapped(response, MAX_OPENAI_TTS_RESPONSE_BYTES);
        } catch (err) {
          console.error('OpenAI-compatible TTS body read error:', err);
          return c.json({ error: 'TTS service unavailable', fallback: true }, 502);
        }

        if (!isValidMp3Bytes(audioBytes)) {
          console.error(
            `OpenAI-compatible TTS returned invalid or empty MP3 (${audioBytes.byteLength} bytes)`,
          );
          return c.json({ error: 'TTS service unavailable', fallback: true }, 502);
        }

        earned = true;
        await cache.put(cacheKey, audioBytes);
        return c.json({
          audioContent: Buffer.from(audioBytes).toString('base64'),
          contentType: 'audio/mp3',
        });
      }

      // Google path. A pack that lists 'google' must carry the voice fields.
      if (!langConfig.ttsCode || !langConfig.ttsVoice) {
        console.error(`Language "${lang}" declares Google TTS but has no ttsCode/ttsVoice`);
        return c.json({ error: 'TTS voice not configured for this language', fallback: true }, 503);
      }

      // Cache first (#226): identical (language, voice, rate, text) always
      // renders identical audio, so a hit skips Google entirely — checked
      // before the key gate (cached audio plays even keyless) and before
      // metering, since ttsCharsPerMonth meters *synthesized* characters and a
      // hit synthesizes nothing. This is what makes read-along affordable:
      // re-reads and cross-user vocab overlap stop billing.
      const cacheKey = ttsCacheKey({
        language: lang,
        voice: `${langConfig.ttsCode}:${langConfig.ttsVoice}`,
        rate: speakingRate,
        text,
      });
      const hit = await cache.get(cacheKey);
      if (hit) {
        return c.json({
          audioContent: Buffer.from(hit).toString('base64'),
          contentType: 'audio/mp3',
          cached: true,
        });
      }

      const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
      if (!apiKey) {
        return c.json({ error: 'Google Cloud API key not configured', fallback: true }, 503);
      }

      // Managed-key TTS metering (#222), by synthesized characters. Reserved
      // before the Google call and refunded (via `finally`) on any non-success
      // exit, so a failed/over-cap synth never bills and two concurrent requests
      // can't both slip past the cap (#222 review). The client's browser TTS
      // fallback stays free, so over-limit still speaks.
      const ttsVerdict = entitlements.reserve(userId, 'ttsCharsPerMonth', text.length);
      if (!ttsVerdict.allowed) return planLimitResponse(c, ttsVerdict);
      reservation = ttsVerdict.reservation;

      const synthesizeRequest: SynthesizeRequest = {
        input: { text },
        voice: {
          languageCode: langConfig.ttsCode,
          name: langConfig.ttsVoice,
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate,
          pitch: 0,
        },
      };

      const response = await fetch(`${GOOGLE_TTS_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(synthesizeRequest),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error('Google TTS error:', error);
        // Return fallback flag so the client can use browser TTS.
        return c.json(
          { error: error.error?.message || 'TTS API error', fallback: true },
          response.status as ContentfulStatusCode,
        );
      }

      const data = await response.json();

      if (!data.audioContent) {
        return c.json({ error: 'No audio content returned', fallback: true }, 500);
      }

      earned = true; // Google synthesized the characters — the usage is real
      // Best-effort store (put never throws): the next request for this tuple —
      // from any user — is served from cache instead of re-billed.
      await cache.put(cacheKey, new Uint8Array(Buffer.from(data.audioContent, 'base64')));
      return c.json({ audioContent: data.audioContent, contentType: 'audio/mp3' });
    } catch (error) {
      console.error('TTS route error:', error);
      return c.json({ error: 'Internal server error', fallback: true }, 500);
    } finally {
      // Every non-success exit (fallback returns, throws) refunds the reservation.
      if (reservation && !earned) entitlements.refund(reservation);
    }
  },
);

export default app;
