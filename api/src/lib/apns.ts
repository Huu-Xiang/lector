/**
 * Apple Push Notification service (APNs) sender with token-based auth.
 * Settings: APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, APNS_KEY (the .p8
 * text, or a path to the file). Without all four, no sender exists.
 */
import { createSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import http2 from 'node:http2';

export type ApnsEnvironment = 'sandbox' | 'production';
/** `unregistered`: Apple no longer accepts this token, so the caller deletes it. */
export type ApnsResult = 'sent' | 'unregistered' | 'failed';

export interface ApnsSettings {
  keyId: string;
  teamId: string;
  bundleId: string;
  key: string;
}

export interface ApnsNotification {
  token: string;
  environment: ApnsEnvironment;
  title: string;
  body: string;
  /** Extra top-level payload keys the app reads on a tap. */
  data?: Record<string, string>;
}

export interface ApnsRequest {
  host: string;
  path: string;
  headers: Record<string, string>;
  body: string;
}

export interface ApnsTransport {
  post(request: ApnsRequest): Promise<{ status: number; body: string }>;
}

export interface ApnsSender {
  send(notification: ApnsNotification): Promise<ApnsResult>;
}

const HOSTS: Record<ApnsEnvironment, string> = {
  sandbox: 'api.sandbox.push.apple.com',
  production: 'api.push.apple.com',
};

/** Apple rejects a provider token older than 60 minutes and throttles new ones under 20. */
const TOKEN_TTL_MS = 40 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const UNREGISTERED_REASONS = new Set(['BadDeviceToken', 'Unregistered']);

type Env = Record<string, string | undefined>;

function readKey(value: string): string | null {
  if (value.includes('BEGIN')) return value.replace(/\\n/g, '\n');
  if (!existsSync(value)) return null;
  return readFileSync(value, 'utf8');
}

export function apnsSettingsFromEnv(env: Env = process.env): ApnsSettings | null {
  const { APNS_KEY_ID: keyId, APNS_TEAM_ID: teamId, APNS_BUNDLE_ID: bundleId } = env;
  const rawKey = env.APNS_KEY;
  if (!keyId || !teamId || !bundleId || !rawKey) return null;
  const key = readKey(rawKey);
  return key ? { keyId, teamId, bundleId, key } : null;
}

const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

function signProviderToken(settings: ApnsSettings, nowMs: number): string {
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: settings.keyId }));
  const payload = base64url(
    JSON.stringify({ iss: settings.teamId, iat: Math.floor(nowMs / 1000) }),
  );
  const signature = createSign('SHA256')
    .update(`${header}.${payload}`)
    .sign({ key: settings.key, dsaEncoding: 'ieee-p1363' });
  return `${header}.${payload}.${base64url(signature)}`;
}

function reasonOf(body: string): string {
  try {
    return String((JSON.parse(body) as { reason?: unknown }).reason ?? '');
  } catch {
    return '';
  }
}

export function createApnsSender(
  settings: ApnsSettings,
  transport: ApnsTransport = createHttp2Transport(),
  now: () => number = Date.now,
): ApnsSender {
  let cached: { token: string; at: number } | null = null;

  function providerToken(): string {
    const at = now();
    if (!cached || at - cached.at > TOKEN_TTL_MS) {
      cached = { token: signProviderToken(settings, at), at };
    }
    return cached.token;
  }

  return {
    async send(notification) {
      const body = JSON.stringify({
        aps: { alert: { title: notification.title, body: notification.body }, sound: 'default' },
        ...notification.data,
      });
      try {
        const response = await transport.post({
          host: HOSTS[notification.environment],
          path: `/3/device/${notification.token}`,
          headers: {
            authorization: `bearer ${providerToken()}`,
            'apns-topic': settings.bundleId,
            'apns-push-type': 'alert',
            'content-type': 'application/json',
          },
          body,
        });
        if (response.status === 200) return 'sent';
        const reason = reasonOf(response.body);
        if (response.status === 410 || UNREGISTERED_REASONS.has(reason)) return 'unregistered';
        console.error(`[apns] refused: ${response.status} ${reason}`);
        return 'failed';
      } catch (err) {
        console.error('[apns] request failed:', err);
        return 'failed';
      }
    },
  };
}

let warned = false;

export function resetApnsWarning(): void {
  warned = false;
}

/** The sender for the APNS_* settings, or null (logged once) when they are incomplete. */
export function getApnsSender(env: Env = process.env): ApnsSender | null {
  const settings = apnsSettingsFromEnv(env);
  if (settings) return createApnsSender(settings);
  if (!warned) {
    warned = true;
    console.log(
      '[apns] APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID or APNS_KEY is missing; push is off',
    );
  }
  return null;
}

/** An HTTP/2 transport that keeps one session per host. `originFor` lets a test point at a local server. */
export function createHttp2Transport(
  originFor: (host: string) => string = (host) => `https://${host}`,
): ApnsTransport & { close(): void } {
  const sessions = new Map<string, http2.ClientHttp2Session>();

  function sessionFor(host: string): http2.ClientHttp2Session {
    const existing = sessions.get(host);
    if (existing && !existing.closed && !existing.destroyed) return existing;
    const session = http2.connect(originFor(host));
    session.on('error', () => sessions.delete(host));
    session.on('close', () => sessions.delete(host));
    sessions.set(host, session);
    return session;
  }

  return {
    post(request) {
      return new Promise((resolve, reject) => {
        const session = sessionFor(request.host);
        const stream = session.request({
          ':method': 'POST',
          ':path': request.path,
          ...request.headers,
        });
        let status = 0;
        let body = '';
        const timer = setTimeout(() => {
          stream.close();
          reject(new Error('APNs request timed out'));
        }, REQUEST_TIMEOUT_MS);
        const fail = (err: Error) => {
          clearTimeout(timer);
          reject(err);
        };
        session.once('error', fail);
        stream.on('response', (headers) => (status = Number(headers[':status'])));
        stream.on('data', (chunk) => (body += chunk));
        stream.on('error', fail);
        stream.on('end', () => {
          clearTimeout(timer);
          session.off('error', fail);
          resolve({ status, body });
        });
        stream.end(request.body);
      });
    },
    close() {
      for (const session of sessions.values()) session.close();
      sessions.clear();
    },
  };
}
