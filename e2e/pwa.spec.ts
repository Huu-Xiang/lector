import { test, expect } from '@playwright/test';

test.describe('installable web app', () => {
  test('serves a manifest with the app icons', async ({ page, request }) => {
    await page.goto('/landing');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();

    const manifest = await (await request.get(href!)).json();
    expect(manifest.name).toBe('Readfox');
    expect(manifest.display).toBe('standalone');
    for (const icon of manifest.icons as Array<{ src: string }>) {
      expect((await request.get(icon.src)).status()).toBe(200);
    }
  });

  test('Settings shows the install card with desktop help', async ({ page }) => {
    await page.goto('/settings');
    const card = page.getByTestId('install-app-card');
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-platform', 'desktop');
  });

  test.describe('on an iPhone', () => {
    test.use({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    });

    test('Settings lists the Share steps', async ({ page }) => {
      await page.goto('/settings');
      const card = page.getByTestId('install-app-card');
      await expect(card).toHaveAttribute('data-platform', 'ios');
      await expect(card.getByRole('listitem')).toHaveCount(3);
    });
  });

  test('the card hides inside the installed app', async ({ page }) => {
    await page.addInitScript(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (query: string) =>
        query === '(display-mode: standalone)'
          ? ({
              ...real(query),
              matches: true,
              addEventListener() {},
              removeEventListener() {},
            } as MediaQueryList)
          : real(query);
    });
    await page.goto('/settings');
    await expect(page.getByTestId('language-preferences')).toBeVisible();
    await expect(page.getByTestId('install-app-card')).toHaveCount(0);
  });
});
