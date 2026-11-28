import { expect, test } from '@playwright/test';

test.describe('native vocabulary test shell', () => {
  test.use({
    viewport: { width: 393, height: 852 },
    userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 ReadfoxApp/1',
  });

  for (const route of ['/vocab-test', '/vocab-test/fr', '/vocab-test/es']) {
    test(`${route} keeps setup visitors in the native shell`, async ({ page }) => {
      await page.goto(`${route}?from=setup`);
      const main = page.getByTestId('vocab-test-workspace');
      await expect(main).toBeVisible();
      await expect(
        main.getByRole('heading', { name: 'Vocabulary test', exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId('vocab-intro')).toBeVisible();
      await expect(page.getByTestId('vocab-language-tabs')).toHaveCount(0);
      await expect(page.getByTestId('vocab-ssr-book-links')).toHaveCount(0);
      await expect(page.getByTestId('vocab-faq')).toHaveCount(0);
      await expect(page.getByText('Interface language', { exact: true })).toHaveCount(0);
      const box = await main.boundingBox();
      expect(box?.width).toBe(393);
      await expect(main.getByRole('link', { name: 'Back', exact: true })).toHaveAttribute(
        'href',
        '/setup',
      );
      await page.getByTestId('vocab-start').click();
      await expect(page.getByTestId('vocab-option').first()).toBeVisible();
      await expect(page.getByTestId('vocab-option').first().locator('kbd')).toBeHidden();
    });
  }

  test('navigation visitors keep language choice and return to Me', async ({ page }) => {
    await page.goto('/vocab-test?from=nav');
    await expect(page.getByTestId('vocab-language-tabs')).toBeVisible();
    await expect(
      page.getByTestId('vocab-test-workspace').getByRole('link', { name: 'Back', exact: true }),
    ).toHaveAttribute('href', '/me');
  });
});

test('web visitors retain vocabulary SEO content and language tools', async ({ page }) => {
  await page.goto('/vocab-test?from=setup');
  await expect(page.getByTestId('vocab-language-tabs')).toBeVisible();
  await expect(page.getByTestId('vocab-ssr-book-links')).toBeVisible();
  await expect(page.getByTestId('vocab-faq')).toBeVisible();
});
