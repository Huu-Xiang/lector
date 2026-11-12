import { oauthProvider } from '@better-auth/oauth-provider';
import type { GenericOAuthConfig } from 'better-auth/plugins';
import { APIError } from 'better-auth/api';

export function validateReadfoxAuthOrigin(value: string): URL {
  const origin = new URL(value);
  const local = origin.hostname === 'localhost' || origin.hostname === '127.0.0.1';
  if (
    origin.origin !== value ||
    (origin.protocol !== 'https:' && !(local && origin.protocol === 'http:'))
  )
    throw new Error('Invalid Readfox beta OAuth origin');
  return origin;
}

export function readfoxBetaProvider(loginOrigin: string, isSuspended: (id: string) => boolean) {
  return oauthProvider({
    loginPage: new URL('/beta-login', loginOrigin).href,
    consentPage: new URL('/login', loginOrigin).href,
    scopes: ['openid', 'profile', 'email'],
    grantTypes: ['authorization_code'],
    allowDynamicClientRegistration: false,
    clientPrivileges: () => false,
    disableJwtPlugin: true,
    accessTokenExpiresIn: 60,
    postLogin: {
      page: new URL('/beta-login', loginOrigin).href,
      shouldRedirect: () => false,
      consentReferenceId: ({ user }) => {
        if (!user.emailVerified || isSuspended(user.id)) {
          throw new APIError('FORBIDDEN', {
            message: 'Readfox account is not eligible for beta login',
          });
        }
        return undefined;
      },
    },
  });
}

export function readfoxBetaClient(
  issuer: string,
  clientId: string,
  clientSecret: string,
): GenericOAuthConfig {
  const base = new URL('/api/auth/', validateReadfoxAuthOrigin(issuer));
  const userInfoUrl = new URL('oauth2/userinfo', base);
  return {
    providerId: 'oidc',
    clientId,
    clientSecret,
    issuer: base.href.slice(0, -1),
    requireIssuerValidation: true,
    authorizationUrl: new URL('oauth2/authorize', base).href,
    tokenUrl: new URL('oauth2/token', base).href,
    scopes: ['openid', 'profile', 'email'],
    authentication: 'basic',
    pkce: true,
    async getUserInfo(tokens) {
      if (!tokens.accessToken) return null;
      const response = await fetch(userInfoUrl, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return null;
      const { sub, email, email_verified, name } = await response.json();
      if (email_verified !== true || typeof sub !== 'string' || !sub || typeof email !== 'string') {
        return null;
      }
      return { id: sub, email, name: typeof name === 'string' ? name : email, emailVerified: true };
    },
  };
}
