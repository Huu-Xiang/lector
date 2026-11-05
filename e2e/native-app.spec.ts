import { expect, test } from '@playwright/test';

const APP_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 ReadfoxApp/1';

test.describe('iPhone app rules', () => {
  test.describe('inside the app', () => {
    test.use({ userAgent: APP_UA });

    test('the pricing page sends the app to the library', async ({ page }) => {
      await page.goto('/pricing');
      await page.waitForURL((url) => !url.pathname.startsWith('/pricing'));
      await expect(page.getByTestId('pricing-tiers')).toHaveCount(0);
    });

    test('the legal footer has no pricing link', async ({ page }) => {
      await page.goto('/privacy');
      await expect(page.getByRole('link', { name: 'Privacy' }).first()).toBeVisible();
      await expect(page.locator('footer a[href="/pricing"], nav a[href="/pricing"]')).toHaveCount(
        0,
      );
    });
  });

  test.describe('on the web', () => {
    test('the pricing page and its footer link stay', async ({ page }) => {
      await page.goto('/pricing');
      await expect(page.getByTestId('pricing-tiers')).toBeVisible();
      await page.goto('/privacy');
      await expect(page.locator('a[href="/pricing"]').first()).toBeVisible();
    });
  });
});
