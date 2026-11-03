import { test, expect } from '@playwright/test';

test.describe('pricing page', () => {
  test('the server HTML already holds the plan cards', async ({ request }) => {
    const html = await (await request.get('/pricing')).text();
    expect(html).toContain('data-testid="pricing-tiers"');
    expect(html).toContain('data-testid="pricing-tier-max"');
  });

  test('yearly is the default and the switch changes the period', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByTestId('pricing-cycle-year')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('pricing-cycle-month').click();
    await expect(page.getByTestId('pricing-cycle-month')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('pricing-tier-cloud')).toBeVisible();
  });

  test('terms and refund policy describe card subscriptions', async ({ page }) => {
    await page.goto('/refunds');
    await expect(page.getByText(/within 14 days after a payment/)).toBeVisible();
    await page.goto('/terms');
    await expect(page.getByText(/Merchant of Record/)).toBeVisible();
  });
});
