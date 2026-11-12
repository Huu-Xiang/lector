import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'readfox-sso-e2e-'));
const primary = 'http://localhost:3480';
const beta = 'http://127.0.0.1:3481';
const clientSecret = 'readfox-sso-test-client-secret-0000';
const nextPort = 3482;

function startApi(name, origin, port, extra) {
  const data = join(root, name);
  return Bun.spawn(['bun', 'run', 'src/index.ts'], {
    cwd: join(import.meta.dir, '../api'),
    env: {
      PATH: process.env.PATH,
      DATA_DIR: data,
      DICT_FETCH: '0',
      READING_FEED: '0',
      CLASSIFY_WORKER: '0',
      PORT: port,
      LECTOR_MODE: 'cloud',
      BETTER_AUTH_SECRET: `readfox-sso-${name}-test-secret-0000000000000000`,
      BETTER_AUTH_URL: origin,
      LECTOR_TRUSTED_ORIGINS: origin,
      EMAIL_FILE: join(data, 'mail.jsonl'),
      ...extra,
    },
    stdout: 'inherit',
    stderr: 'inherit',
  });
}

const apps = [
  startApi('primary', primary, '3483', {
    READFOX_BETA_ISSUER_LOGIN_ORIGIN: primary,
    READFOX_BETA_ORIGIN: beta,
    READFOX_BETA_CLIENT_SECRET: clientSecret,
  }),
  startApi('beta', beta, '3484', {
    READFOX_BETA_CONSUMER: '1',
    OIDC_ISSUER: primary,
    OIDC_CLIENT_ID: 'readfox-beta',
    OIDC_CLIENT_SECRET: clientSecret,
    INVITE_REQUIRED: '1',
  }),
];
const ui = Bun.spawn(['node', 'node_modules/next/dist/bin/next', 'start', '-p', String(nextPort)], {
  env: { PATH: process.env.PATH, NEXT_TELEMETRY_DISABLED: '1', DATA_DIR: root },
  stdout: 'inherit',
  stderr: 'inherit',
});
apps.push(ui);

for (const [origin, apiPort] of [
  [primary, 3483],
  [beta, 3484],
]) {
  const url = new URL(origin);
  Bun.serve({
    hostname: url.hostname,
    port: Number(url.port),
    async fetch(req) {
      const requested = new URL(req.url);
      if (requested.pathname === '/__sso_e2e_mail' && origin === primary) {
        const mail = await Bun.file(join(root, 'primary', 'mail.jsonl')).text();
        return Response.json(
          mail
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line)),
        );
      }
      if (requested.pathname === '/__env.js') {
        return new Response(
          `window.__ENV__ = ${JSON.stringify({
            API_URL: origin,
            LECTOR_MODE: 'cloud',
            ...(origin === beta
              ? { OIDC_LOGIN: '1', OIDC_PROVIDER_NAME: 'Readfox', INVITE_REQUIRED: '1' }
              : {}),
          })};`,
          { headers: { 'Content-Type': 'application/javascript' } },
        );
      }
      const port =
        requested.pathname.startsWith('/api/') || requested.pathname === '/health'
          ? apiPort
          : nextPort;
      try {
        const upstream = new Request(
          `http://127.0.0.1:${port}${requested.pathname}${requested.search}`,
          req,
        );
        upstream.headers.set('Accept-Encoding', 'identity');
        return await fetch(upstream, { redirect: 'manual' });
      } catch {
        return new Response('Starting', { status: 503 });
      }
    },
  });
}
function stop() {
  for (const app of apps) app.kill();
  process.exit(0);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
