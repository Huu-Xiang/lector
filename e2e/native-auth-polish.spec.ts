import { expect, test } from '@playwright/test';

const cloudApi = `http://localhost:${process.env.E2E_AUTH_API_PORT || '3462'}`;

test.skip(!!process.env.E2E_EXTERNAL_SERVER, 'no cloud-mode API in the external-server run');

test.use({
  viewport: { width: 393, height: 852 },
  userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 ReadfoxApp/1',
});

test.beforeEach(async ({ page }) => {
  await page.route('**/__env.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `window.__ENV__ = ${JSON.stringify({ API_URL: cloudApi, LECTOR_MODE: 'cloud' })};`,
    }),
  );
});

test('native auth forms fill the viewport and retain comfortable controls', async ({ page }) => {
  for (const path of ['/login', '/register', '/reset-password', '/two-factor']) {
    await page.goto(path);
    const main = page.locator('main.native-auth-shell');
    await expect(main).toBeVisible();
    await expect(main.getByRole('heading', { level: 1 })).toHaveCSS('font-size', '28px');
    const box = await main.boundingBox();
    expect(box?.x).toBe(0);
    expect(box?.width).toBe(393);
    for (const input of await main.locator('input:not([type="checkbox"]):visible').all()) {
      const inputBox = await input.boundingBox();
      expect(inputBox?.height).toBeGreaterThanOrEqual(48);
    }
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  }

  const checkbox = page.getByTestId('twofactor-trust-device');
  const label = checkbox.locator('..');
  expect((await label.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect((await checkbox.boundingBox())?.width).toBe(20);
  await label.click();
  await expect(checkbox).toBeChecked();

  await page.goto('/register');
  await expect(page.getByTestId('welcome-offer').getByRole('link')).toHaveCount(0);
});

test('welcome account actions stay in the bottom thumb zone on both phone sizes', async ({
  page,
}) => {
  for (const viewport of [
    { width: 393, height: 852 },
    { width: 375, height: 667 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/welcome');
    const create = page.getByRole('link', { name: 'Create account' });
    const signIn = page.getByRole('link', { name: 'Sign in', exact: true });
    await expect(create).toBeInViewport({ ratio: 1 });
    await expect(signIn).toBeInViewport({ ratio: 1 });
    const box = await signIn.boundingBox();
    expect(box).not.toBeNull();
    expect(viewport.height - (box!.y + box!.height)).toBeLessThanOrEqual(24);
    await create.click();
    await expect(page).toHaveURL(/\/register$/);
  }
});

test('welcome press effects respect reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/welcome');
  const create = page.getByRole('link', { name: 'Create account' });
  await expect(create).toBeVisible();
  const box = await create.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await expect(create).toHaveCSS('transition-duration', '0s');
  await expect(create).toHaveCSS('transform', 'none');
  await page.mouse.move(0, 0);
  await page.mouse.up();
});
