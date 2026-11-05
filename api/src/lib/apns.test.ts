import '../test-guard';
import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { createPublicKey, createVerify, generateKeyPairSync } from 'node:crypto';
import http2 from 'node:http2';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  apnsSettingsFromEnv,
  createApnsSender,
  createHttp2Transport,
  getApnsSender,
  resetApnsWarning,
  type ApnsNotification,
  type ApnsRequest,
  type ApnsTransport,
} from './apns';

let privatePem: string;
let publicPem: string;

beforeAll(() => {
  const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
});

const ENV = {
  APNS_KEY_ID: 'KEY1234567',
  APNS_TEAM_ID: 'TEAM123456',
  APNS_BUNDLE_ID: 'app.readfox.ios',
};

const NOTE: ApnsNotification = {
  token: 'device-token-1',
  environment: 'production',
  title: 'Readfox',
  body: '3 cards due for review',
  data: { path: '/practice' },
};

function fakeTransport(status: number, body: object = {}) {
  const requests: ApnsRequest[] = [];
  const transport: ApnsTransport = {
    async post(request) {
      requests.push(request);
      return { status, body: JSON.stringify(body) };
    },
  };
  return { transport, requests };
}

describe('apnsSettingsFromEnv', () => {
  test('reads the four settings', () => {
    const settings = apnsSettingsFromEnv({ ...ENV, APNS_KEY: privatePem });
    expect(settings).toMatchObject({
      keyId: 'KEY1234567',
      teamId: 'TEAM123456',
      bundleId: 'app.readfox.ios',
    });
  });

  test('reads the key from a file path', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'apns-')), 'AuthKey.p8');
    writeFileSync(file, privatePem);
    expect(apnsSettingsFromEnv({ ...ENV, APNS_KEY: file })?.key).toBe(privatePem);
  });

  test('is null when any setting is missing', () => {
    expect(apnsSettingsFromEnv({ ...ENV })).toBeNull();
    expect(apnsSettingsFromEnv({ ...ENV, APNS_KEY: privatePem, APNS_TEAM_ID: '' })).toBeNull();
  });
});

describe('getApnsSender', () => {
  const warnings: string[] = [];
  const originalLog = console.log;
  afterEach(() => {
    console.log = originalLog;
    warnings.length = 0;
    resetApnsWarning();
  });

  test('returns nothing and logs once when a setting is missing', () => {
    console.log = (...args: unknown[]) => void warnings.push(args.join(' '));
    expect(getApnsSender({})).toBeNull();
    expect(getApnsSender({})).toBeNull();
    expect(warnings.filter((line) => line.includes('[apns]'))).toHaveLength(1);
  });
});

describe('createApnsSender', () => {
  const settings = () => ({ ...apnsSettingsFromEnv({ ...ENV, APNS_KEY: privatePem })! });

  test('posts one alert with a signed ES256 token', async () => {
    const { transport, requests } = fakeTransport(200);
    const sender = createApnsSender(settings(), transport, () => 1_700_000_000_000);
    expect(await sender.send(NOTE)).toBe('sent');

    const [request] = requests;
    expect(request.host).toBe('api.push.apple.com');
    expect(request.path).toBe('/3/device/device-token-1');
    expect(request.headers['apns-topic']).toBe('app.readfox.ios');
    expect(request.headers['apns-push-type']).toBe('alert');
    expect(JSON.parse(request.body)).toEqual({
      aps: { alert: { title: 'Readfox', body: '3 cards due for review' }, sound: 'default' },
      path: '/practice',
    });

    const [header, payload, signature] = request.headers.authorization
      .replace('bearer ', '')
      .split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      alg: 'ES256',
      kid: 'KEY1234567',
    });
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual({
      iss: 'TEAM123456',
      iat: 1_700_000_000,
    });
    const verifier = createVerify('SHA256').update(`${header}.${payload}`);
    expect(
      verifier.verify(
        { key: createPublicKey(publicPem), dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true);
  });

  test('uses the sandbox host for a sandbox token', async () => {
    const { transport, requests } = fakeTransport(200);
    await createApnsSender(settings(), transport).send({ ...NOTE, environment: 'sandbox' });
    expect(requests[0].host).toBe('api.sandbox.push.apple.com');
  });

  test('reports HTTP 410 as unregistered', async () => {
    const { transport } = fakeTransport(410, { reason: 'Unregistered' });
    expect(await createApnsSender(settings(), transport).send(NOTE)).toBe('unregistered');
  });

  test('reports BadDeviceToken as unregistered', async () => {
    const { transport } = fakeTransport(400, { reason: 'BadDeviceToken' });
    expect(await createApnsSender(settings(), transport).send(NOTE)).toBe('unregistered');
  });

  test('reports any other refusal as failed', async () => {
    const { transport } = fakeTransport(500, { reason: 'InternalServerError' });
    expect(await createApnsSender(settings(), transport).send(NOTE)).toBe('failed');
  });
});

describe('createHttp2Transport against a local HTTP/2 server', () => {
  test('sends the request and reads the status and body', async () => {
    const server = http2.createServer();
    const seen: { method?: unknown; path?: unknown; topic?: unknown; body: string }[] = [];
    server.on('stream', (stream: http2.ServerHttp2Stream, headers) => {
      const entry = {
        method: headers[':method'],
        path: headers[':path'],
        topic: headers['apns-topic'],
        body: '',
      };
      stream.on('data', (chunk) => (entry.body += chunk));
      stream.on('end', () => {
        seen.push(entry);
        stream.respond({ ':status': 410 });
        stream.end(JSON.stringify({ reason: 'Unregistered' }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    const transport = createHttp2Transport(() => `http://127.0.0.1:${port}`);
    try {
      const sender = createApnsSender(
        { keyId: 'K', teamId: 'T', bundleId: 'app.readfox.ios', key: privatePem },
        transport,
      );
      expect(await sender.send(NOTE)).toBe('unregistered');
      expect(await sender.send(NOTE)).toBe('unregistered');
      expect(seen).toHaveLength(2);
      expect(seen[0]).toMatchObject({
        method: 'POST',
        path: '/3/device/device-token-1',
        topic: 'app.readfox.ios',
      });
      expect(JSON.parse(seen[0].body).aps.alert.body).toBe('3 cards due for review');
    } finally {
      transport.close();
      server.close();
    }
  });
});
