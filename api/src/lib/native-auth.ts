import { createHash, randomBytes } from 'node:crypto';
import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { isSuspended } from './account-flags';

const encoded = /^[a-f0-9]{64}$/;
const lifetimeMs = 60_000;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const verificationId = (challenge: string, code: string) =>
  `native-auth:${hash(`${challenge}:${code}`)}`;

export function nativeAuthHandoff() {
  return {
    id: 'native-auth-handoff',
    endpoints: {
      finishNativeAuth: createAuthEndpoint(
        '/native-auth/finish',
        { method: 'POST', use: [sessionMiddleware] },
        async (ctx) => {
          if (ctx.request?.headers.get('origin') !== new URL(ctx.context.baseURL).origin) {
            throw ctx.error('FORBIDDEN');
          }
          const challenge = ctx.request?.headers.get('x-readfox-auth-challenge') ?? '';
          if (!encoded.test(challenge)) throw ctx.error('BAD_REQUEST');
          if (isSuspended(ctx.context.session.user.id)) throw ctx.error('FORBIDDEN');
          const code = randomBytes(32).toString('hex');
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: verificationId(challenge, code),
            value: ctx.context.session.session.token,
            expiresAt: new Date(Date.now() + lifetimeMs),
          });
          ctx.setHeader('Cache-Control', 'no-store');
          return ctx.json({ code });
        },
      ),
      redeemNativeAuth: createAuthEndpoint(
        '/native-auth/redeem',
        { method: 'POST' },
        async (ctx) => {
          const request = ctx.request;
          if (!request || request.headers.get('origin') !== new URL(ctx.context.baseURL).origin) {
            throw ctx.error('FORBIDDEN');
          }
          const code = request.headers.get('x-readfox-auth-code') ?? '';
          const verifier = request.headers.get('x-readfox-auth-verifier') ?? '';
          if (!encoded.test(code) || !encoded.test(verifier)) throw ctx.error('BAD_REQUEST');

          const record = await ctx.context.internalAdapter.consumeVerificationValue(
            verificationId(hash(verifier), code),
          );
          if (!record || record.expiresAt <= new Date()) throw ctx.error('UNAUTHORIZED');
          const session = await ctx.context.internalAdapter.findSession(record.value);
          if (!session || session.session.expiresAt <= new Date()) throw ctx.error('UNAUTHORIZED');
          if (isSuspended(session.user.id)) throw ctx.error('FORBIDDEN');
          await setSessionCookie(ctx, session);
          return ctx.json({ ok: true });
        },
      ),
    },
  };
}
