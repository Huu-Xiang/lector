import { test, expect, type Page } from '@playwright/test';

/**
 * The provider button (Google in production) is driven by the runtime flags
 * OIDC_LOGIN and OIDC_PROVIDER_NAME that docker-entrypoint.sh writes into
 * __env.js. Render only: the redirect to the provider needs a live issuer, and
 * api/src/lib/accounts.test.ts covers the server side with a fake issuer.
 */

const CLOUD_API = `http://localhost:${process.env.E2E_AUTH_API_PORT || '3462'}`;

test.skip(!!process.env.E2E_EXTERNAL_SERVER, 'no cloud-mode API in the external-server run');

async function useCloudEnv(page: Page, extraEnv: Record<string, string> = {}) {
  await page.route('**/__env.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `window.__ENV__ = ${JSON.stringify({ API_URL: CLOUD_API, LECTOR_MODE: 'cloud', ...extraEnv })};`,
    }),
  );
}

test.describe('provider button on the sign-in and register pages', () => {
  test('both pages show "Continue with Google" when the flags are set', async ({ page }) => {
    await useCloudEnv(page, { OIDC_LOGIN: '1', OIDC_PROVIDER_NAME: 'Google' });
    for (const [path, testId] of [
      ['/login', 'login-oidc'],
      ['/register', 'register-oidc'],
    ]) {
      await page.goto(path);
      await expect(page.getByTestId(testId)).toHaveText('Continue with Google');
    }
  });

  test('the register page puts the provider button above the email form', async ({ page }) => {
    await useCloudEnv(page, { OIDC_LOGIN: '1', OIDC_PROVIDER_NAME: 'Google' });
    await page.goto('/register');
    await expect(page.getByTestId('register-or-email')).toHaveText('or sign up with email');
    const button = await page.getByTestId('register-oidc').boundingBox();
    const firstField = await page.getByTestId('register-name').boundingBox();
    expect(button!.y).toBeLessThan(firstField!.y);
  });

  test('with required invites the provider button stays under the invite field', async ({
    page,
  }) => {
    await useCloudEnv(page, {
      OIDC_LOGIN: '1',
      OIDC_PROVIDER_NAME: 'Google',
      INVITE_REQUIRED: '1',
    });
    await page.goto('/register');
    await expect(page.getByTestId('register-oidc')).toBeVisible();
    await expect(page.getByTestId('register-or-email')).toHaveCount(0);
    const button = await page.getByTestId('register-oidc').boundingBox();
    const invite = await page.getByTestId('register-invite').boundingBox();
    expect(button!.y).toBeGreaterThan(invite!.y);
  });

  test('neither page shows the button without the flag', async ({ page }) => {
    await useCloudEnv(page);
    await page.goto('/login');
    await expect(page.getByTestId('login-submit')).toBeVisible();
    await expect(page.getByTestId('login-oidc')).toHaveCount(0);
    await page.goto('/register');
    await expect(page.getByTestId('register-submit')).toBeVisible();
    await expect(page.getByTestId('register-oidc')).toHaveCount(0);
  });

  test('a cancelled provider login shows a message on /login', async ({ page }) => {
    await useCloudEnv(page, { OIDC_LOGIN: '1', OIDC_PROVIDER_NAME: 'Google' });
    await page.goto('/login?error=access_denied');
    await expect(page.getByText('Sign-in was cancelled', { exact: false })).toBeVisible();
  });
});
