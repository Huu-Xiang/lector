import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Cloud-mode product-mail switch in Settings. The switch and the stop link in a
 * mail share one suppression list, so the same state shows in both.
 *
 * Same harness as account-deletion-cloud.spec.ts: shared :3456 UI, cloud-mode
 * API on :3462, emails read from tmp/e2e-data-cloud/emails.jsonl.
 */

const CLOUD_API = 'http://localhost:3462';
const EMAILS = path.join(__dirname, '..', 'tmp', 'e2e-data-cloud', 'emails.jsonl');

test.skip(!!process.env.E2E_EXTERNAL_SERVER, 'no cloud-mode API in the external-server run');

const EMAIL = `mailswitch+${Date.now()}@e2e.test`;
const PASSWORD = 'mail-switch-please-123';

async function useCloudEnv(page: Page) {
  await page.route('**/__env.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `window.__ENV__ = ${JSON.stringify({ API_URL: CLOUD_API, LECTOR_MODE: 'cloud' })};`,
    }),
  );
}

function verifyLink(address: string): string {
  const mails = readFileSync(EMAILS, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { to: string; subject: string; text: string })
    .filter((m) => m.to === address && /verify/i.test(m.subject))
    .reverse();
  const url = mails[0]?.text.match(/https?:\/\/\S+/)?.[0];
  if (!url) throw new Error(`no verification link for ${address}`);
  return url;
}

test.describe.serial('cloud product emails switch', () => {
  test('register and verify', async ({ page }) => {
    await useCloudEnv(page);
    await page.goto('/register');
    await page.getByTestId('register-name').fill('Switcher');
    await page.getByTestId('register-email').fill(EMAIL);
    await page.getByTestId('register-password').fill(PASSWORD);
    await page.getByTestId('register-confirm-password').fill(PASSWORD);
    await page.getByTestId('register-submit').click();
    await expect(page.getByTestId('register-check-email')).toBeVisible();
    await page.goto(verifyLink(EMAIL));
    await page.waitForURL('http://localhost:3456/**');
    await expect(page.getByTestId('account-name')).toHaveAttribute('data-email', EMAIL);
  });

  test('turning the switch off and on survives a reload', async ({ page }) => {
    await useCloudEnv(page);
    await page.goto('/login');
    await page.getByTestId('login-email').fill(EMAIL);
    await page.getByTestId('login-password').fill(PASSWORD);
    await page.getByTestId('login-submit').click();
    await page.waitForURL((url) => url.pathname === '/');

    await page.goto('/setup');
    await page.getByTestId('setup-language-show-all').click();
    await page.getByTestId('setup-language-af').click();
    await page.getByTestId('skip-guided-onboarding').click();
    await page.waitForURL((url) => url.pathname === '/');

    await page.goto('/settings');
    const on = page.getByTestId('product-emails-on');
    const off = page.getByTestId('product-emails-off');
    await expect(on).toHaveAttribute('aria-pressed', 'true');

    await off.click();
    await expect(off).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.getByTestId('product-emails-off')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('product-emails-on').click();
    await expect(page.getByTestId('product-emails-on')).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.getByTestId('product-emails-on')).toHaveAttribute('aria-pressed', 'true');
  });
});
